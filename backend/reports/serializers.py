from decimal import Decimal
from rest_framework import serializers


class AdminDashboardSerializer(serializers.Serializer):
    total_vehicles = serializers.IntegerField()
    total_drivers = serializers.IntegerField()
    total_customers = serializers.IntegerField()
    total_bookings = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    revenue_last_6_months = serializers.ListField(
        child=serializers.DictField()
    )
    recent_bookings = serializers.ListField(
        child=serializers.DictField()
    )
    vehicle_status_counts = serializers.DictField()
    trip_status_counts = serializers.DictField()
    pending_approvals = serializers.IntegerField()
    expiring_documents_count = serializers.IntegerField(default=0)
    expired_documents_count = serializers.IntegerField(default=0)
    fuel_cost_this_month = serializers.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    expenses_this_month = serializers.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    top_cost_vehicles = serializers.ListField(child=serializers.DictField(), default=list)
    next_5_expiring_documents = serializers.ListField(child=serializers.DictField(), default=list)


class FleetManagerDashboardSerializer(serializers.Serializer):
    total_vehicles = serializers.IntegerField()
    active_trips = serializers.IntegerField()
    pending_approvals = serializers.IntegerField()
    pending_driver_requests = serializers.IntegerField()
    bus_bookings_due = serializers.IntegerField()
    upcoming_maintenance = serializers.ListField(
        child=serializers.DictField()
    )
    trip_status_counts = serializers.DictField()
    expiring_documents_count = serializers.IntegerField(default=0)
    expired_documents_count = serializers.IntegerField(default=0)
    fuel_cost_this_month = serializers.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    expenses_this_month = serializers.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    top_cost_vehicles = serializers.ListField(child=serializers.DictField(), default=list)
    next_5_expiring_documents = serializers.ListField(child=serializers.DictField(), default=list)


class CustomerDashboardSerializer(serializers.Serializer):
    total_bookings = serializers.IntegerField()
    upcoming_trips = serializers.IntegerField()
    pending_payments = serializers.DictField()
    recent_bookings = serializers.ListField(
        child=serializers.DictField()
    )
    unread_notifications = serializers.IntegerField()


class DriverDashboardSerializer(serializers.Serializer):
    todays_trips = serializers.IntegerField()
    upcoming_trip = serializers.DictField(allow_null=True)
    completed_trips = serializers.IntegerField()
    total_distance_km = serializers.IntegerField()
    current_trip = serializers.DictField(allow_null=True)
    own_fuel_logs_this_month = serializers.IntegerField(default=0)
    own_pending_expenses_count = serializers.IntegerField(default=0)
    cash_to_hand_over = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    pending_payment_trip = serializers.DictField(allow_null=True, required=False)


class ReportResponseSerializer(serializers.Serializer):
    summary = serializers.DictField()
    count = serializers.IntegerField()
    next = serializers.CharField(allow_null=True, required=False)
    previous = serializers.CharField(allow_null=True, required=False)
    rows = serializers.ListField(child=serializers.DictField())
