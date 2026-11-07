import csv
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum, Avg, F, Q, ExpressionWrapper, IntegerField, Subquery, OuterRef
from django.db.models.functions import TruncMonth, Coalesce
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.utils import extend_schema, OpenApiParameter
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.renderers import JSONRenderer, BaseRenderer
from rest_framework.views import APIView
from rest_framework.negotiation import DefaultContentNegotiation

from accounts.models import User
from accounts.permissions import (
    IsAdmin,
    IsFleetManager,
    IsCustomer,
    IsDriver,
    IsAdminOrFleetManager,
)
from bookings.models import Booking, BusSchedule
from drivers.models import Driver
from notifications.models import Notification
from payments.models import Payment
from trips.models import Trip
from vehicles.models import Vehicle, Maintenance
from fuel.models import FuelLog
from expenses.models import Expense
from documents.models import Document

from .serializers import (
    AdminDashboardSerializer,
    FleetManagerDashboardSerializer,
    CustomerDashboardSerializer,
    DriverDashboardSerializer,
    ReportResponseSerializer,
)


class CSVRenderer(BaseRenderer):
    media_type = 'text/csv'
    format = 'csv'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


class BaseReportView(APIView):
    """Base class for reports allowing JSON and CSV format query params."""
    renderer_classes = [JSONRenderer, CSVRenderer]



# ==========================================
# DASHBOARDS
# ==========================================

def get_dashboard_document_and_cost_metrics(now):
    today = now.date()
    start_of_month = today.replace(day=1)

    expiring_documents_count = Document.objects.filter(
        review_status=Document.ReviewStatus.APPROVED,
        expiry_date__gte=today,
        expiry_date__lte=today + timedelta(days=30),
    ).count()

    expired_documents_count = Document.objects.filter(
        review_status=Document.ReviewStatus.APPROVED,
        expiry_date__lt=today,
    ).count()

    fuel_cost_this_month = FuelLog.objects.filter(
        review_status=FuelLog.ReviewStatus.APPROVED,
        date__gte=start_of_month,
        date__lte=today,
    ).aggregate(tot=Coalesce(Sum('total_cost'), Decimal('0.00')))['tot']

    expenses_this_month = Expense.objects.filter(
        status=Expense.Status.APPROVED,
        date__gte=start_of_month,
        date__lte=today,
    ).aggregate(tot=Coalesce(Sum('amount'), Decimal('0.00')))['tot']

    # Top cost vehicles (top 5) using database aggregation
    fuel_sq = FuelLog.objects.filter(vehicle=OuterRef('pk'), review_status=FuelLog.ReviewStatus.APPROVED).values('vehicle').annotate(tot=Sum('total_cost')).values('tot')
    expense_sq = Expense.objects.filter(vehicle=OuterRef('pk'), status=Expense.Status.APPROVED).values('vehicle').annotate(tot=Sum('amount')).values('tot')
    maint_sq = Maintenance.objects.filter(vehicle=OuterRef('pk')).values('vehicle').annotate(tot=Sum('cost')).values('tot')

    veh_annotated = (
        Vehicle.objects.annotate(
            fuel_cost=Coalesce(Subquery(fuel_sq), Decimal('0.00')),
            expense_cost=Coalesce(Subquery(expense_sq), Decimal('0.00')),
            maintenance_cost=Coalesce(Subquery(maint_sq), Decimal('0.00')),
        )
        .annotate(
            total_cost=F('fuel_cost') + F('expense_cost') + F('maintenance_cost')
        )
        .order_by('-total_cost')[:5]
    )

    top_cost_vehicles = [
        {
            "vehicle_id": v.id,
            "registration_number": v.registration_number,
            "brand": v.brand,
            "model": v.model,
            "fuel_cost": float(v.fuel_cost),
            "expense_cost": float(v.expense_cost),
            "maintenance_cost": float(v.maintenance_cost),
            "total_cost": float(v.total_cost),
        }
        for v in veh_annotated
    ]

    next_5_docs_qs = (
        Document.objects.filter(review_status=Document.ReviewStatus.APPROVED, expiry_date__gte=today)
        .select_related('vehicle', 'driver', 'driver__user')
        .order_by('expiry_date')[:5]
    )
    next_5_expiring_documents = [
        {
            "id": d.id,
            "doc_type": d.doc_type,
            "doc_type_display": d.get_doc_type_display(),
            "target": d.vehicle.registration_number if d.vehicle else (d.driver.user.full_name if d.driver and d.driver.user else "Driver"),
            "expiry_date": d.expiry_date.isoformat(),
            "days_left": d.days_left,
            "expiry_status": d.expiry_status,
        }
        for d in next_5_docs_qs
    ]

    return {
        "expiring_documents_count": expiring_documents_count,
        "expired_documents_count": expired_documents_count,
        "fuel_cost_this_month": fuel_cost_this_month,
        "expenses_this_month": expenses_this_month,
        "top_cost_vehicles": top_cost_vehicles,
        "next_5_expiring_documents": next_5_expiring_documents,
    }


class AdminDashboardView(APIView):
    """Admin Dashboard statistics and metrics."""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(
        summary="Admin Dashboard",
        description="Comprehensive dashboard overview for system administrators.",
        responses={200: AdminDashboardSerializer},
    )
    def get(self, request):
        now = timezone.now()

        # Counts
        total_vehicles = Vehicle.objects.count()
        total_drivers = Driver.objects.count()
        total_customers = User.objects.filter(role=User.Role.CUSTOMER).count()
        total_bookings = Booking.objects.count()

        # Revenue (total PAID amount)
        paid_agg = Payment.objects.filter(status=Payment.Status.PAID).aggregate(
            total=Coalesce(Sum('amount'), Decimal('0.00'))
        )
        total_revenue = paid_agg['total']

        # Revenue last 6 months using TruncMonth
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        curr_year = now.year
        curr_month = now.month
        six_months_ago_month = curr_month - 5
        six_months_ago_year = curr_year
        while six_months_ago_month <= 0:
            six_months_ago_month += 12
            six_months_ago_year -= 1
        six_months_ago_start = now.replace(year=six_months_ago_year, month=six_months_ago_month, day=1, hour=0, minute=0, second=0, microsecond=0)

        monthly_rev_qs = (
            Payment.objects.filter(
                status=Payment.Status.PAID,
                created_at__gte=six_months_ago_start,
            )
            .annotate(month=TruncMonth('created_at'))
            .values('month')
            .annotate(total=Sum('amount'))
            .order_by('month')
        )
        monthly_rev_map = {
            item['month'].strftime('%Y-%m'): float(item['total'])
            for item in monthly_rev_qs if item['month']
        }

        # Build list for all 6 months in order
        revenue_last_6_months = []
        for i in range(5, -1, -1):
            m = curr_month - i
            y = curr_year
            while m <= 0:
                m += 12
                y -= 1
            key = f"{y:04d}-{m:02d}"
            revenue_last_6_months.append({
                "month": key,
                "amount": monthly_rev_map.get(key, 0.0),
            })

        # Recent bookings (last 5)
        recent_bookings_qs = Booking.objects.select_related('customer').order_by('-created_at')[:5]
        recent_bookings = [
            {
                "id": b.id,
                "customer_name": b.customer.full_name,
                "customer_email": b.customer.email,
                "booking_type": b.booking_type,
                "status": b.status,
                "created_at": b.created_at.isoformat(),
            }
            for b in recent_bookings_qs
        ]

        # Vehicle status counts
        vehicle_status_agg = Vehicle.objects.values('status').annotate(count=Count('id'))
        vehicle_status_counts = {item['status']: item['count'] for item in vehicle_status_agg}

        # Trip status counts
        trip_status_agg = Trip.objects.values('status').annotate(count=Count('id'))
        trip_status_counts = {item['status']: item['count'] for item in trip_status_agg}

        # Pending approvals (count of pending Fleet Manager and Driver requests)
        pending_approvals = User.objects.filter(
            role__in=[User.Role.FLEET_MANAGER, User.Role.DRIVER],
            approval_status=User.ApprovalStatus.PENDING,
        ).count()

        extra_metrics = get_dashboard_document_and_cost_metrics(now)

        data = {
            "total_vehicles": total_vehicles,
            "total_drivers": total_drivers,
            "total_customers": total_customers,
            "total_bookings": total_bookings,
            "revenue": total_revenue,
            "revenue_last_6_months": revenue_last_6_months,
            "recent_bookings": recent_bookings,
            "vehicle_status_counts": vehicle_status_counts,
            "trip_status_counts": trip_status_counts,
            "pending_approvals": pending_approvals,
            **extra_metrics,
        }
        return Response(data, status=status.HTTP_200_OK)


class FleetManagerDashboardView(APIView):
    """Fleet Manager Dashboard overview."""
    permission_classes = [IsAuthenticated, IsAdminOrFleetManager]

    @extend_schema(
        summary="Fleet Manager Dashboard",
        description="Operational metrics for fleet managers.",
        responses={200: FleetManagerDashboardSerializer},
    )
    def get(self, request):
        now = timezone.now()
        in_24_hours = now + timedelta(hours=24)

        total_vehicles = Vehicle.objects.count()
        active_trips = Trip.objects.filter(status=Trip.Status.IN_PROGRESS).count()
        pending_approvals = Booking.objects.filter(status=Booking.Status.PENDING).count()
        pending_driver_requests = User.objects.filter(
            role=User.Role.DRIVER,
            approval_status=User.ApprovalStatus.PENDING,
        ).count()
        bus_bookings_due = BusSchedule.objects.filter(
            status=BusSchedule.Status.OPEN,
            departure_datetime__gte=now,
            departure_datetime__lte=in_24_hours,
        ).count()

        # Upcoming maintenance (next 5)
        upcoming_maintenance_qs = (
            Maintenance.objects.filter(
                scheduled_date__gte=now.date(),
                status__in=[Maintenance.Status.SCHEDULED, Maintenance.Status.IN_PROGRESS]
            )
            .select_related('vehicle')
            .order_by('scheduled_date')[:5]
        )
        upcoming_maintenance = [
            {
                "id": m.id,
                "title": m.title,
                "vehicle_registration": m.vehicle.registration_number,
                "scheduled_date": m.scheduled_date.isoformat(),
                "status": m.status,
            }
            for m in upcoming_maintenance_qs
        ]

        # Trip status counts
        trip_status_agg = Trip.objects.values('status').annotate(count=Count('id'))
        trip_status_counts = {item['status']: item['count'] for item in trip_status_agg}
        for st in [Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS, Trip.Status.COMPLETED, Trip.Status.CANCELLED]:
            if st not in trip_status_counts:
                trip_status_counts[st] = 0

        extra_metrics = get_dashboard_document_and_cost_metrics(now)

        data = {
            "total_vehicles": total_vehicles,
            "active_trips": active_trips,
            "pending_approvals": pending_approvals,
            "pending_driver_requests": pending_driver_requests,
            "bus_bookings_due": bus_bookings_due,
            "upcoming_maintenance": upcoming_maintenance,
            "trip_status_counts": trip_status_counts,
            **extra_metrics,
        }
        return Response(data, status=status.HTTP_200_OK)


class CustomerDashboardView(APIView):
    """Customer Dashboard metrics and quick summary."""
    permission_classes = [IsAuthenticated, IsCustomer]

    @extend_schema(
        summary="Customer Dashboard",
        description="Overview for authenticated customer.",
        responses={200: CustomerDashboardSerializer},
    )
    def get(self, request):
        user = request.user
        now = timezone.now()

        # Total bookings
        total_bookings = Booking.objects.filter(customer=user).count()

        # Upcoming trips
        # Trips for customer's bookings scheduled in future or in progress/scheduled
        upcoming_trips = Trip.objects.filter(
            booking__customer=user,
            status__in=[Trip.Status.SCHEDULED, Trip.Status.IN_PROGRESS],
        ).count()

        # Pending payments (count and total amount)
        unpaid_agg = Payment.objects.filter(
            customer=user,
            status__in=[Payment.Status.UNPAID, Payment.Status.PAYMENT_INITIATED]
        ).aggregate(
            count=Count('id'),
            total=Coalesce(Sum('amount'), Decimal('0.00'))
        )
        pending_payments = {
            "count": unpaid_agg['count'],
            "total_amount": float(unpaid_agg['total']),
        }

        # Recent bookings (last 5)
        recent_bookings_qs = Booking.objects.filter(customer=user).order_by('-created_at')[:5]
        recent_bookings = [
            {
                "id": b.id,
                "booking_type": b.booking_type,
                "pickup_location": b.pickup_location,
                "drop_location": b.drop_location,
                "status": b.status,
                "created_at": b.created_at.isoformat(),
            }
            for b in recent_bookings_qs
        ]

        # Unread notifications
        unread_notifications = Notification.objects.filter(user=user, is_read=False).count()

        data = {
            "total_bookings": total_bookings,
            "upcoming_trips": upcoming_trips,
            "pending_payments": pending_payments,
            "recent_bookings": recent_bookings,
            "unread_notifications": unread_notifications,
        }
        return Response(data, status=status.HTTP_200_OK)


class DriverDashboardView(APIView):
    """Driver Dashboard metrics."""
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(
        summary="Driver Dashboard",
        description="Assigned trips, distance traveled, and current trip status for driver.",
        responses={200: DriverDashboardSerializer},
    )
    def get(self, request):
        user = request.user
        try:
            driver = user.driver_profile
        except Driver.DoesNotExist:
            return Response({"detail": "Driver profile not found."}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.localdate()
        today_start = timezone.make_aware(timezone.datetime.combine(today, timezone.datetime.min.time()))
        today_end = timezone.make_aware(timezone.datetime.combine(today, timezone.datetime.max.time()))

        # Today's trips
        todays_trips = Trip.objects.filter(
            driver=driver,
            scheduled_datetime__range=(today_start, today_end)
        ).count()

        # Upcoming trip (earliest scheduled trip in the future)
        upcoming_trip_obj = (
            Trip.objects.filter(
                driver=driver,
                status=Trip.Status.SCHEDULED,
                scheduled_datetime__gte=timezone.now()
            )
            .select_related('vehicle')
            .order_by('scheduled_datetime')
            .first()
        )
        upcoming_trip = None
        if upcoming_trip_obj:
            upcoming_trip = {
                "id": upcoming_trip_obj.id,
                "source": upcoming_trip_obj.source,
                "destination": upcoming_trip_obj.destination,
                "scheduled_datetime": upcoming_trip_obj.scheduled_datetime.isoformat(),
                "vehicle_registration": upcoming_trip_obj.vehicle.registration_number,
            }

        # Completed trips count
        completed_trips = Trip.objects.filter(
            driver=driver,
            status=Trip.Status.COMPLETED
        ).count()

        # Total distance km: sum of (end_odometer - start_odometer)
        distance_agg = (
            Trip.objects.filter(
                driver=driver,
                status=Trip.Status.COMPLETED,
                start_odometer__isnull=False,
                end_odometer__isnull=False
            )
            .annotate(
                trip_km=ExpressionWrapper(
                    F('end_odometer') - F('start_odometer'),
                    output_field=IntegerField()
                )
            )
            .aggregate(total_km=Coalesce(Sum('trip_km'), 0))
        )
        total_distance_km = max(0, distance_agg['total_km'])

        # Current trip (if IN_PROGRESS)
        current_trip_obj = (
            Trip.objects.filter(
                driver=driver,
                status=Trip.Status.IN_PROGRESS
            )
            .select_related('vehicle')
            .first()
        )
        current_trip = None
        if current_trip_obj:
            current_trip = {
                "id": current_trip_obj.id,
                "source": current_trip_obj.source,
                "destination": current_trip_obj.destination,
                "start_odometer": current_trip_obj.start_odometer,
                "vehicle_registration": current_trip_obj.vehicle.registration_number,
                "started_at": current_trip_obj.started_at.isoformat() if current_trip_obj.started_at else None,
            }

        start_of_month = today.replace(day=1)
        own_fuel_logs_this_month = FuelLog.objects.filter(
            driver=driver,
            date__gte=start_of_month,
            date__lte=today,
        ).count()
        own_pending_expenses_count = Expense.objects.filter(
            submitted_by=user,
            status=Expense.Status.PENDING,
        ).count()

        data = {
            "todays_trips": todays_trips,
            "upcoming_trip": upcoming_trip,
            "completed_trips": completed_trips,
            "total_distance_km": total_distance_km,
            "current_trip": current_trip,
            "own_fuel_logs_this_month": own_fuel_logs_this_month,
            "own_pending_expenses_count": own_pending_expenses_count,
        }
        return Response(data, status=status.HTTP_200_OK)


# ==========================================
# REPORTS
# ==========================================

def parse_date_filters(request, date_field="created_at"):
    """Helper to parse date_from and date_to parameters."""
    date_from_str = request.query_params.get("date_from")
    date_to_str = request.query_params.get("date_to")

    filters = Q()
    if date_from_str:
        d_from = parse_date(date_from_str)
        if d_from:
            dt_from = timezone.make_aware(timezone.datetime.combine(d_from, timezone.datetime.min.time()))
            filters &= Q(**{f"{date_field}__gte": dt_from})

    if date_to_str:
        d_to = parse_date(date_to_str)
        if d_to:
            dt_to = timezone.make_aware(timezone.datetime.combine(d_to, timezone.datetime.max.time()))
            filters &= Q(**{f"{date_field}__lte": dt_to})

    return filters


class BookingsReportView(BaseReportView):
    """Bookings Report with date filtering and CSV export."""
    permission_classes = [IsAuthenticated, IsAdminOrFleetManager]

    @extend_schema(
        summary="Bookings Report",
        description="Report of bookings with summary metrics and CSV export option.",
        parameters=[
            OpenApiParameter(name="date_from", type=str, description="YYYY-MM-DD start date"),
            OpenApiParameter(name="date_to", type=str, description="YYYY-MM-DD end date"),
            OpenApiParameter(name="format", type=str, description="Set to 'csv' to export as CSV"),
        ],
        responses={200: ReportResponseSerializer},
    )
    def get(self, request):
        q_filter = parse_date_filters(request, "created_at")
        qs = Booking.objects.filter(q_filter).select_related('customer').order_by('-created_at')

        # CSV format check
        if request.query_params.get("format") == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="bookings_report.csv"'
            writer = csv.writer(response)
            writer.writerow(["ID", "Customer Email", "Booking Type", "Status", "Pickup Location", "Drop Location", "Created At"])
            for b in qs:
                writer.writerow([
                    b.id,
                    b.customer.email,
                    b.booking_type,
                    b.status,
                    b.pickup_location,
                    b.drop_location,
                    b.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                ])
            return response

        # Summary calculation
        summary = {
            "total_bookings": qs.count(),
            "approved": qs.filter(status=Booking.Status.APPROVED).count(),
            "pending": qs.filter(status=Booking.Status.PENDING).count(),
            "completed": qs.filter(status=Booking.Status.COMPLETED).count(),
            "cancelled": qs.filter(status=Booking.Status.CANCELLED).count(),
        }

        # Pagination
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        rows = [
            {
                "id": b.id,
                "customer": b.customer.email,
                "booking_type": b.booking_type,
                "status": b.status,
                "pickup_location": b.pickup_location,
                "drop_location": b.drop_location,
                "created_at": b.created_at.isoformat(),
            }
            for b in page
        ]

        return Response({
            "summary": summary,
            "count": paginator.page.paginator.count,
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "rows": rows,
        }, status=status.HTTP_200_OK)


class TripsReportView(BaseReportView):
    """Trips Report with date filtering and CSV export."""
    permission_classes = [IsAuthenticated, IsAdminOrFleetManager]

    @extend_schema(
        summary="Trips Report",
        description="Report of trips with summary metrics and CSV export option.",
        parameters=[
            OpenApiParameter(name="date_from", type=str, description="YYYY-MM-DD start date"),
            OpenApiParameter(name="date_to", type=str, description="YYYY-MM-DD end date"),
            OpenApiParameter(name="format", type=str, description="Set to 'csv' to export as CSV"),
        ],
        responses={200: ReportResponseSerializer},
    )
    def get(self, request):
        q_filter = parse_date_filters(request, "scheduled_datetime")
        qs = (
            Trip.objects.filter(q_filter)
            .select_related('vehicle', 'driver__user')
            .order_by('-scheduled_datetime')
        )

        if request.query_params.get("format") == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="trips_report.csv"'
            writer = csv.writer(response)
            writer.writerow(["ID", "Vehicle", "Driver", "Source", "Destination", "Status", "Distance (km)", "Fare", "Scheduled Datetime"])
            for t in qs:
                writer.writerow([
                    t.id,
                    t.vehicle.registration_number,
                    t.driver.user.full_name,
                    t.source,
                    t.destination,
                    t.status,
                    t.distance_km if t.distance_km is not None else 0,
                    t.total_fare if t.total_fare is not None else 0,
                    t.scheduled_datetime.strftime("%Y-%m-%d %H:%M:%S"),
                ])
            return response

        # Summary calculation
        tot_trips = qs.count()
        completed_qs = qs.filter(
            status=Trip.Status.COMPLETED,
            start_odometer__isnull=False,
            end_odometer__isnull=False,
        ).annotate(
            km=ExpressionWrapper(F('end_odometer') - F('start_odometer'), output_field=IntegerField())
        )
        dist_agg = completed_qs.aggregate(
            tot_km=Coalesce(Sum('km'), 0),
            tot_fare=Coalesce(Sum('total_fare'), Decimal('0.00')),
        )

        summary = {
            "total_trips": tot_trips,
            "completed": qs.filter(status=Trip.Status.COMPLETED).count(),
            "in_progress": qs.filter(status=Trip.Status.IN_PROGRESS).count(),
            "scheduled": qs.filter(status=Trip.Status.SCHEDULED).count(),
            "cancelled": qs.filter(status=Trip.Status.CANCELLED).count(),
            "total_distance_km": dist_agg['tot_km'],
            "total_fare": float(dist_agg['tot_fare']),
        }

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        rows = [
            {
                "id": t.id,
                "vehicle": t.vehicle.registration_number,
                "driver": t.driver.user.full_name,
                "source": t.source,
                "destination": t.destination,
                "status": t.status,
                "distance_km": t.distance_km,
                "total_fare": float(t.total_fare) if t.total_fare else None,
                "scheduled_datetime": t.scheduled_datetime.isoformat(),
            }
            for b in [None]
            for t in page
        ]

        return Response({
            "summary": summary,
            "count": paginator.page.paginator.count,
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "rows": rows,
        }, status=status.HTTP_200_OK)


class PaymentsReportView(BaseReportView):
    """Payments Report (Admin Only) with date filtering and CSV export."""
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(
        summary="Payments Report",
        description="Financial report of payments (Admin only) with CSV export.",
        parameters=[
            OpenApiParameter(name="date_from", type=str, description="YYYY-MM-DD start date"),
            OpenApiParameter(name="date_to", type=str, description="YYYY-MM-DD end date"),
            OpenApiParameter(name="format", type=str, description="Set to 'csv' to export as CSV"),
        ],
        responses={200: ReportResponseSerializer},
    )
    def get(self, request):
        q_filter = parse_date_filters(request, "created_at")
        qs = (
            Payment.objects.filter(q_filter)
            .select_related('customer', 'trip')
            .order_by('-created_at')
        )

        if request.query_params.get("format") == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="payments_report.csv"'
            writer = csv.writer(response)
            writer.writerow(["ID", "Customer", "Trip ID", "Amount", "Status", "Method", "Created At"])
            for p in qs:
                writer.writerow([
                    p.id,
                    p.customer.email,
                    p.trip_id,
                    p.amount,
                    p.status,
                    p.payment_method or "",
                    p.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                ])
            return response

        # Summary
        paid_agg = qs.filter(status=Payment.Status.PAID).aggregate(
            total_paid=Coalesce(Sum('amount'), Decimal('0.00'))
        )
        refunded_agg = qs.filter(status=Payment.Status.REFUNDED).aggregate(
            total_refunded=Coalesce(Sum('amount'), Decimal('0.00'))
        )

        summary = {
            "total_transactions": qs.count(),
            "paid_count": qs.filter(status=Payment.Status.PAID).count(),
            "unpaid_count": qs.filter(status=Payment.Status.UNPAID).count(),
            "refunded_count": qs.filter(status=Payment.Status.REFUNDED).count(),
            "total_revenue": float(paid_agg['total_paid']),
            "total_refunded": float(refunded_agg['total_refunded']),
        }

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        rows = [
            {
                "id": p.id,
                "customer": p.customer.email,
                "trip_id": p.trip_id,
                "amount": float(p.amount),
                "status": p.status,
                "payment_method": p.payment_method,
                "created_at": p.created_at.isoformat(),
            }
            for p in page
        ]

        return Response({
            "summary": summary,
            "count": paginator.page.paginator.count,
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "rows": rows,
        }, status=status.HTTP_200_OK)


class VehicleUtilizationReportView(BaseReportView):
    """Vehicle Utilization Report: trips, total distance km, total revenue per vehicle."""
    permission_classes = [IsAuthenticated, IsAdminOrFleetManager]

    @extend_schema(
        summary="Vehicle Utilization Report",
        description="Aggregated statistics per vehicle: trips, distance traveled, and revenue.",
        parameters=[
            OpenApiParameter(name="date_from", type=str, description="YYYY-MM-DD start date for trip scheduled date"),
            OpenApiParameter(name="date_to", type=str, description="YYYY-MM-DD end date for trip scheduled date"),
            OpenApiParameter(name="format", type=str, description="Set to 'csv' to export as CSV"),
        ],
        responses={200: ReportResponseSerializer},
    )
    def get(self, request):
        date_from_str = request.query_params.get("date_from")
        date_to_str = request.query_params.get("date_to")

        trip_filter = Q()
        if date_from_str:
            d_from = parse_date(date_from_str)
            if d_from:
                dt_from = timezone.make_aware(timezone.datetime.combine(d_from, timezone.datetime.min.time()))
                trip_filter &= Q(trips__scheduled_datetime__gte=dt_from)

        if date_to_str:
            d_to = parse_date(date_to_str)
            if d_to:
                dt_to = timezone.make_aware(timezone.datetime.combine(d_to, timezone.datetime.max.time()))
                trip_filter &= Q(trips__scheduled_datetime__lte=dt_to)

        # Database aggregation per vehicle using subqueries
        vehicles_qs = Vehicle.objects.all().order_by('id')

        tc_qs = Trip.objects.filter(vehicle=OuterRef("pk"))
        if date_from_str:
            d_from = parse_date(date_from_str)
            if d_from:
                dt_from = timezone.make_aware(timezone.datetime.combine(d_from, timezone.datetime.min.time()))
                tc_qs = tc_qs.filter(scheduled_datetime__gte=dt_from)
        if date_to_str:
            d_to = parse_date(date_to_str)
            if d_to:
                dt_to = timezone.make_aware(timezone.datetime.combine(d_to, timezone.datetime.max.time()))
                tc_qs = tc_qs.filter(scheduled_datetime__lte=dt_to)

        trips_count_sq = tc_qs.values("vehicle").annotate(c=Count("id")).values("c")

        dist_sq = tc_qs.filter(
            status=Trip.Status.COMPLETED,
            start_odometer__isnull=False,
            end_odometer__isnull=False,
        ).annotate(
            km=ExpressionWrapper(F("end_odometer") - F("start_odometer"), output_field=IntegerField())
        ).values("vehicle").annotate(tot_km=Sum("km")).values("tot_km")

        rev_qs = Payment.objects.filter(
            trip__vehicle=OuterRef("pk"),
            status=Payment.Status.PAID,
        )
        if date_from_str:
            d_from = parse_date(date_from_str)
            if d_from:
                dt_from = timezone.make_aware(timezone.datetime.combine(d_from, timezone.datetime.min.time()))
                rev_qs = rev_qs.filter(trip__scheduled_datetime__gte=dt_from)
        if date_to_str:
            d_to = parse_date(date_to_str)
            if d_to:
                dt_to = timezone.make_aware(timezone.datetime.combine(d_to, timezone.datetime.max.time()))
                rev_qs = rev_qs.filter(trip__scheduled_datetime__lte=dt_to)

        revenue_sq = rev_qs.values("trip__vehicle").annotate(rev=Sum("amount")).values("rev")

        annotated_qs = vehicles_qs.annotate(
            trips_count=Coalesce(Subquery(trips_count_sq), 0),
            total_distance_km=Coalesce(Subquery(dist_sq), 0),
            total_revenue=Coalesce(Subquery(revenue_sq), Decimal("0.00")),
        )

        if request.query_params.get("format") == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="vehicle_utilization_report.csv"'
            writer = csv.writer(response)
            writer.writerow(["Vehicle ID", "Registration Number", "Type", "Status", "Trips Count", "Total Distance (km)", "Total Revenue"])
            for v in annotated_qs:
                writer.writerow([
                    v.id,
                    v.registration_number,
                    v.vehicle_type,
                    v.status,
                    v.trips_count,
                    max(0, v.total_distance_km),
                    float(v.total_revenue),
                ])
            return response

        # Summary
        total_vehicles = annotated_qs.count()
        overall_trips = sum(v.trips_count for v in annotated_qs)
        overall_distance = sum(max(0, v.total_distance_km) for v in annotated_qs)
        overall_revenue = sum(float(v.total_revenue) for v in annotated_qs)

        summary = {
            "total_vehicles": total_vehicles,
            "total_trips": overall_trips,
            "total_distance_km": overall_distance,
            "total_revenue": overall_revenue,
        }

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(annotated_qs, request)
        rows = [
            {
                "vehicle_id": v.id,
                "registration_number": v.registration_number,
                "vehicle_type": v.vehicle_type,
                "status": v.status,
                "trips_count": v.trips_count,
                "total_distance_km": max(0, v.total_distance_km),
                "total_revenue": float(v.total_revenue),
            }
            for v in page
        ]

        return Response({
            "summary": summary,
            "count": paginator.page.paginator.count,
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "rows": rows,
        }, status=status.HTTP_200_OK)


class FuelReportView(BaseReportView):
    """Fuel Consumption & Cost Report with filters and CSV export."""
    permission_classes = [IsAuthenticated, IsAdminOrFleetManager]

    @extend_schema(
        summary="Fuel Report",
        description="Report of fuel logs with summary metrics and CSV export option.",
        parameters=[
            OpenApiParameter(name="date_from", type=str, description="YYYY-MM-DD start date"),
            OpenApiParameter(name="date_to", type=str, description="YYYY-MM-DD end date"),
            OpenApiParameter(name="vehicle", type=int, description="Filter by Vehicle ID"),
            OpenApiParameter(name="fuel_type", type=str, description="Filter by Fuel Type"),
            OpenApiParameter(name="format", type=str, description="Set to 'csv' to export as CSV"),
        ],
        responses={200: ReportResponseSerializer},
    )
    def get(self, request):
        q_filter = parse_date_filters(request, "date")
        vehicle_id = request.query_params.get("vehicle")
        if vehicle_id:
            q_filter &= Q(vehicle_id=vehicle_id)
        fuel_type = request.query_params.get("fuel_type")
        if fuel_type:
            q_filter &= Q(fuel_type=fuel_type)

        # Only include APPROVED fuel logs in the report
        qs = (
            FuelLog.objects.filter(q_filter, review_status=FuelLog.ReviewStatus.APPROVED)
            .select_related("vehicle", "driver", "driver__user")
            .order_by("-date", "-created_at")
        )

        if request.query_params.get("format") == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="fuel_report.csv"'
            writer = csv.writer(response)
            writer.writerow([
                "ID", "Vehicle", "Driver", "Date", "Fuel Type", "Quantity",
                "Price Per Unit", "Total Cost", "Odometer (km)", "Full Tank", "Station"
            ])
            for log in qs:
                writer.writerow([
                    log.id,
                    log.vehicle.registration_number if log.vehicle else "",
                    log.driver.user.full_name if log.driver and log.driver.user else "",
                    log.date.isoformat(),
                    log.fuel_type,
                    float(log.quantity),
                    float(log.price_per_unit),
                    float(log.total_cost),
                    log.odometer_km,
                    "Yes" if log.is_full_tank else "No",
                    log.station_name,
                ])
            return response

        agg = qs.aggregate(
            tot_qty=Coalesce(Sum("quantity"), Decimal("0.00")),
            tot_cost=Coalesce(Sum("total_cost"), Decimal("0.00")),
            avg_price=Coalesce(Avg("price_per_unit"), Decimal("0.00")),
        )
        tot_qty = agg["tot_qty"]
        tot_cost = agg["tot_cost"]
        avg_price = round(tot_cost / tot_qty, 2) if tot_qty > 0 else round(agg["avg_price"], 2)

        summary = {
            "total_records": qs.count(),
            "total_quantity": float(tot_qty),
            "total_cost": float(tot_cost),
            "average_price": float(avg_price),
        }

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        rows = [
            {
                "id": log.id,
                "vehicle": log.vehicle.registration_number if log.vehicle else None,
                "driver": log.driver.user.full_name if log.driver and log.driver.user else None,
                "date": log.date.isoformat(),
                "fuel_type": log.fuel_type,
                "quantity": float(log.quantity),
                "price_per_unit": float(log.price_per_unit),
                "total_cost": float(log.total_cost),
                "odometer_km": log.odometer_km,
                "is_full_tank": log.is_full_tank,
                "mileage_kmpl": log.mileage_kmpl,
                "station_name": log.station_name,
            }
            for log in page
        ]

        return Response({
            "summary": summary,
            "count": paginator.page.paginator.count,
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "rows": rows,
        }, status=status.HTTP_200_OK)


class ExpensesReportView(BaseReportView):
    """Expenses Report with category/status filters and CSV export."""
    permission_classes = [IsAuthenticated, IsAdminOrFleetManager]

    @extend_schema(
        summary="Expenses Report",
        description="Report of fleet expenses with summary metrics and CSV export option.",
        parameters=[
            OpenApiParameter(name="date_from", type=str, description="YYYY-MM-DD start date"),
            OpenApiParameter(name="date_to", type=str, description="YYYY-MM-DD end date"),
            OpenApiParameter(name="category", type=str, description="Filter by Category"),
            OpenApiParameter(name="status", type=str, description="Filter by Status"),
            OpenApiParameter(name="vehicle", type=int, description="Filter by Vehicle ID"),
            OpenApiParameter(name="format", type=str, description="Set to 'csv' to export as CSV"),
        ],
        responses={200: ReportResponseSerializer},
    )
    def get(self, request):
        q_filter = parse_date_filters(request, "date")
        category = request.query_params.get("category")
        if category:
            q_filter &= Q(category=category)
        status_param = request.query_params.get("status")
        if status_param:
            q_filter &= Q(status=status_param)
        vehicle_id = request.query_params.get("vehicle")
        if vehicle_id:
            q_filter &= Q(vehicle_id=vehicle_id)

        qs = (
            Expense.objects.filter(q_filter)
            .select_related("vehicle", "trip", "submitted_by", "reviewed_by")
            .order_by("-date", "-created_at")
        )

        if request.query_params.get("format") == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="expenses_report.csv"'
            writer = csv.writer(response)
            writer.writerow([
                "ID", "Category", "Vehicle", "Trip ID", "Amount",
                "Date", "Status", "Submitted By", "Reviewed By", "Description"
            ])
            for exp in qs:
                writer.writerow([
                    exp.id,
                    exp.category,
                    exp.vehicle.registration_number if exp.vehicle else "",
                    exp.trip_id or "",
                    float(exp.amount),
                    exp.date.isoformat(),
                    exp.status,
                    exp.submitted_by.full_name if exp.submitted_by else "",
                    exp.reviewed_by.full_name if exp.reviewed_by else "",
                    exp.description,
                ])
            return response

        agg = qs.aggregate(
            tot=Coalesce(Sum("amount"), Decimal("0.00")),
            appr=Coalesce(Sum("amount", filter=Q(status=Expense.Status.APPROVED)), Decimal("0.00")),
            pend=Coalesce(Sum("amount", filter=Q(status=Expense.Status.PENDING)), Decimal("0.00")),
            rej=Coalesce(Sum("amount", filter=Q(status=Expense.Status.REJECTED)), Decimal("0.00")),
        )

        summary = {
            "total_records": qs.count(),
            "total_amount": float(agg["tot"]),
            "approved_amount": float(agg["appr"]),
            "pending_amount": float(agg["pend"]),
            "rejected_amount": float(agg["rej"]),
        }

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        rows = [
            {
                "id": exp.id,
                "category": exp.category,
                "vehicle": exp.vehicle.registration_number if exp.vehicle else None,
                "trip_id": exp.trip_id,
                "amount": float(exp.amount),
                "date": exp.date.isoformat(),
                "description": exp.description,
                "status": exp.status,
                "submitted_by": exp.submitted_by.full_name if exp.submitted_by else None,
                "reviewed_by": exp.reviewed_by.full_name if exp.reviewed_by else None,
            }
            for exp in page
        ]

        return Response({
            "summary": summary,
            "count": paginator.page.paginator.count,
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "rows": rows,
        }, status=status.HTTP_200_OK)


class DocumentsExpiryReportView(BaseReportView):
    """Documents & Driver Licenses Expiry Report with CSV export."""
    permission_classes = [IsAuthenticated, IsAdminOrFleetManager]

    @extend_schema(
        summary="Documents Expiry Report",
        description="Report of vehicle documents and driver licenses with expiry statuses and CSV export.",
        parameters=[
            OpenApiParameter(name="status", type=str, description="Filter: EXPIRED, EXPIRING_SOON, or VALID"),
            OpenApiParameter(name="doc_type", type=str, description="Filter by doc_type"),
            OpenApiParameter(name="format", type=str, description="Set to 'csv' to export as CSV"),
        ],
        responses={200: ReportResponseSerializer},
    )
    def get(self, request):
        today = timezone.localdate()
        status_filter = request.query_params.get("status")
        doc_type_filter = request.query_params.get("doc_type")

        # 1. Documents (only APPROVED documents)
        docs_qs = Document.objects.filter(review_status=Document.ReviewStatus.APPROVED).select_related("vehicle", "driver", "driver__user").all()
        if doc_type_filter:
            docs_qs = docs_qs.filter(doc_type=doc_type_filter)

        all_items = []
        for d in docs_qs:
            st = d.expiry_status
            if status_filter and st != status_filter:
                continue
            all_items.append({
                "type": "DOCUMENT",
                "id": d.id,
                "target_type": "VEHICLE" if d.vehicle else "DRIVER",
                "target": d.vehicle.registration_number if d.vehicle else (d.driver.user.full_name if d.driver and d.driver.user else "Driver"),
                "doc_type": d.doc_type,
                "doc_type_display": d.get_doc_type_display(),
                "document_number": d.document_number,
                "expiry_date": d.expiry_date.isoformat(),
                "days_left": d.days_left,
                "expiry_status": st,
            })

        # 2. Driver licenses
        if not doc_type_filter or doc_type_filter == Document.DocType.DRIVING_LICENSE:
            drivers = Driver.objects.select_related("user").all()
            for drv in drivers:
                days = (drv.license_expiry - today).days
                st = Document.ExpiryStatus.EXPIRED if days < 0 else (Document.ExpiryStatus.EXPIRING_SOON if days <= 30 else Document.ExpiryStatus.VALID)
                if status_filter and st != status_filter:
                    continue
                all_items.append({
                    "type": "DRIVER_LICENSE",
                    "id": f"lic_{drv.id}",
                    "target_type": "DRIVER",
                    "target": drv.user.full_name if drv.user else "Driver",
                    "doc_type": Document.DocType.DRIVING_LICENSE,
                    "doc_type_display": "Driver License",
                    "document_number": drv.license_number,
                    "expiry_date": drv.license_expiry.isoformat(),
                    "days_left": days,
                    "expiry_status": st,
                })

        all_items.sort(key=lambda x: x["expiry_date"])

        if request.query_params.get("format") == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="documents_expiry_report.csv"'
            writer = csv.writer(response)
            writer.writerow(["Type", "Target Type", "Target", "Document Type", "Document Number", "Expiry Date", "Days Left", "Status"])
            for item in all_items:
                writer.writerow([
                    item["type"],
                    item["target_type"],
                    item["target"],
                    item["doc_type_display"],
                    item["document_number"],
                    item["expiry_date"],
                    item["days_left"],
                    item["expiry_status"],
                ])
            return response

        summary = {
            "total_items": len(all_items),
            "expired_count": sum(1 for x in all_items if x["expiry_status"] == Document.ExpiryStatus.EXPIRED),
            "expiring_soon_count": sum(1 for x in all_items if x["expiry_status"] == Document.ExpiryStatus.EXPIRING_SOON),
            "valid_count": sum(1 for x in all_items if x["expiry_status"] == Document.ExpiryStatus.VALID),
        }

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(all_items, request)

        return Response({
            "summary": summary,
            "count": len(all_items),
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "rows": page,
        }, status=status.HTTP_200_OK)


class VehicleCostReportView(BaseReportView):
    """Vehicle Cost Analysis Report (Fuel + Expenses + Maintenance vs Distance)."""
    permission_classes = [IsAuthenticated, IsAdminOrFleetManager]

    @extend_schema(
        summary="Vehicle Cost Report",
        description="Comprehensive cost breakdown per vehicle (fuel, approved expenses, maintenance, distance, cost/km) with CSV export.",
        parameters=[
            OpenApiParameter(name="vehicle", type=int, description="Filter by Vehicle ID"),
            OpenApiParameter(name="format", type=str, description="Set to 'csv' to export as CSV"),
        ],
        responses={200: ReportResponseSerializer},
    )
    def get(self, request):
        vehicle_id = request.query_params.get("vehicle")
        vehicles_qs = Vehicle.objects.all().order_by("registration_number")
        if vehicle_id:
            vehicles_qs = vehicles_qs.filter(id=vehicle_id)

        # Database aggregation using Subqueries
        fuel_sq = FuelLog.objects.filter(vehicle=OuterRef("pk"), review_status=FuelLog.ReviewStatus.APPROVED).values("vehicle").annotate(tot=Sum("total_cost")).values("tot")
        expense_sq = Expense.objects.filter(vehicle=OuterRef("pk"), status=Expense.Status.APPROVED).values("vehicle").annotate(tot=Sum("amount")).values("tot")
        maint_sq = Maintenance.objects.filter(vehicle=OuterRef("pk")).values("vehicle").annotate(tot=Sum("cost")).values("tot")

        dist_sq = (
            Trip.objects.filter(
                vehicle=OuterRef("pk"),
                status=Trip.Status.COMPLETED,
                start_odometer__isnull=False,
                end_odometer__isnull=False,
            )
            .values("vehicle")
            .annotate(
                total_km=Sum(
                    ExpressionWrapper(
                        F("end_odometer") - F("start_odometer"),
                        output_field=IntegerField(),
                    )
                )
            )
            .values("total_km")
        )

        annotated_qs = vehicles_qs.annotate(
            fuel_cost=Coalesce(Subquery(fuel_sq), Decimal("0.00")),
            expense_cost=Coalesce(Subquery(expense_sq), Decimal("0.00")),
            maintenance_cost=Coalesce(Subquery(maint_sq), Decimal("0.00")),
            distance_travelled=Coalesce(Subquery(dist_sq), 0),
        ).annotate(
            total_cost=F("fuel_cost") + F("expense_cost") + F("maintenance_cost")
        )

        rows_data = []
        for v in annotated_qs:
            dist = max(0, v.distance_travelled)
            tot = v.total_cost
            cost_per_km = round(float(tot) / dist, 2) if dist > 0 else 0.00
            rows_data.append({
                "vehicle_id": v.id,
                "registration_number": v.registration_number,
                "brand": v.brand,
                "model": v.model,
                "fuel_cost": float(v.fuel_cost),
                "approved_expenses": float(v.expense_cost),
                "maintenance_cost": float(v.maintenance_cost),
                "total_cost": float(tot),
                "distance_travelled": dist,
                "cost_per_km": cost_per_km,
            })

        if request.query_params.get("format") == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="vehicle_cost_report.csv"'
            writer = csv.writer(response)
            writer.writerow([
                "Vehicle ID", "Registration", "Brand", "Model", "Fuel Cost",
                "Approved Expenses", "Maintenance Cost", "Total Cost",
                "Distance Travelled (km)", "Cost Per KM"
            ])
            for r in rows_data:
                writer.writerow([
                    r["vehicle_id"],
                    r["registration_number"],
                    r["brand"],
                    r["model"],
                    r["fuel_cost"],
                    r["approved_expenses"],
                    r["maintenance_cost"],
                    r["total_cost"],
                    r["distance_travelled"],
                    r["cost_per_km"],
                ])
            return response

        total_fuel = sum(r["fuel_cost"] for r in rows_data)
        total_expense = sum(r["approved_expenses"] for r in rows_data)
        total_maint = sum(r["maintenance_cost"] for r in rows_data)
        grand_total = sum(r["total_cost"] for r in rows_data)
        total_dist = sum(r["distance_travelled"] for r in rows_data)

        summary = {
            "total_vehicles": len(rows_data),
            "total_fuel_cost": round(total_fuel, 2),
            "total_expense_cost": round(total_expense, 2),
            "total_maintenance_cost": round(total_maint, 2),
            "grand_total_cost": round(grand_total, 2),
            "total_distance_km": total_dist,
            "overall_cost_per_km": round(grand_total / total_dist, 2) if total_dist > 0 else 0.00,
        }

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(rows_data, request)

        return Response({
            "summary": summary,
            "count": len(rows_data),
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "rows": page,
        }, status=status.HTTP_200_OK)

