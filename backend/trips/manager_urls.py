from django.urls import path
from .views import TripViewSet

urlpatterns = [
    path('manager/trips/assign/', TripViewSet.as_view({'post': 'assign'}), name='manager-trips-assign-alias'),
    path('manager/trips/active/', TripViewSet.as_view({'get': 'monitor'}), name='manager-trips-active-alias'),
    path('manager/trips/<int:pk>/tracking/', TripViewSet.as_view({'get': 'track'}), name='manager-trips-tracking-alias'),
    path('manager/available-vehicles/', TripViewSet.as_view({'get': 'assignable'}), name='manager-available-vehicles-alias'),
    path('manager/available-drivers/', TripViewSet.as_view({'get': 'assignable'}), name='manager-available-drivers-alias'),
]
