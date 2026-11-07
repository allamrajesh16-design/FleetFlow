from django.urls import path
from .views import (
    AdminDashboardView,
    FleetManagerDashboardView,
    CustomerDashboardView,
    DriverDashboardView,
    BookingsReportView,
    TripsReportView,
    PaymentsReportView,
    VehicleUtilizationReportView,
    FuelReportView,
    ExpensesReportView,
    DocumentsExpiryReportView,
    VehicleCostReportView,
)

urlpatterns = [
    # Dashboards
    path('dashboard/admin/', AdminDashboardView.as_view(), name='dashboard-admin'),
    path('dashboard/fleet-manager/', FleetManagerDashboardView.as_view(), name='dashboard-fleet-manager'),
    path('dashboard/customer/', CustomerDashboardView.as_view(), name='dashboard-customer'),
    path('dashboard/driver/', DriverDashboardView.as_view(), name='dashboard-driver'),

    # Reports
    path('reports/bookings/', BookingsReportView.as_view(), name='report-bookings'),
    path('reports/trips/', TripsReportView.as_view(), name='report-trips'),
    path('reports/payments/', PaymentsReportView.as_view(), name='report-payments'),
    path('reports/vehicle-utilization/', VehicleUtilizationReportView.as_view(), name='report-vehicle-utilization'),
    path('reports/fuel/', FuelReportView.as_view(), name='report-fuel'),
    path('reports/expenses/', ExpensesReportView.as_view(), name='report-expenses'),
    path('reports/documents-expiry/', DocumentsExpiryReportView.as_view(), name='report-documents-expiry'),
    path('reports/vehicle-cost/', VehicleCostReportView.as_view(), name='report-vehicle-cost'),
]
