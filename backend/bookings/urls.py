from rest_framework.routers import DefaultRouter
from .views import BusScheduleViewSet, BookingViewSet

router = DefaultRouter()
router.register(r'bus-schedules', BusScheduleViewSet, basename='bus-schedule')
router.register(r'bookings', BookingViewSet, basename='booking')

urlpatterns = router.urls
