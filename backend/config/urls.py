"""
URL configuration for config project.

FleetFlow - Smart Vehicle Fleet & Trip Management Platform
"""

from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from core.views import HealthCheckView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path('admin/', admin.site.urls),

    # drf-spectacular schema & Swagger UI
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),

    # System Health Check
    path('api/health/', HealthCheckView.as_view(), name='health-check'),

    # Authentication routes
    path('api/auth/', include('accounts.urls')),

    # Users & Roles (Admin)
    path('api/users/', include('accounts.user_urls')),

    # Fleet & Driver & Maintenance routes
    path('api/vehicles/', include('vehicles.urls')),
    path('api/maintenance/', include('vehicles.maintenance_urls')),
    path('api/drivers/', include('drivers.urls')),

    # Notifications & Bookings & Trips & Payments routes
    path('api/notifications/', include('notifications.urls')),
    path('api/', include('bookings.urls')),
    path('api/trips/', include('trips.urls')),
    path('api/payments/', include('payments.urls')),

    # Dashboards & Reports
    path('api/', include('reports.urls')),

    # Fuel, Expenses, and Documents
    path('api/fuel/', include('fuel.urls')),
    path('api/expenses/', include('expenses.urls')),
    path('api/documents/', include('documents.urls')),

    # JWT Authentication aliases (enforcing verification and approval)
    path('api/token/', include('accounts.urls')),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]

from django.conf import settings
from django.conf.urls.static import static

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
