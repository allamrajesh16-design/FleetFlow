from rest_framework.routers import DefaultRouter
from vehicles.views import MaintenanceViewSet

router = DefaultRouter()
router.register(r'', MaintenanceViewSet, basename='maintenance')

urlpatterns = router.urls
