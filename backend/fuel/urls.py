from rest_framework.routers import DefaultRouter
from .views import FuelLogViewSet

app_name = "fuel"

router = DefaultRouter()
router.register(r"", FuelLogViewSet, basename="fuel")

urlpatterns = router.urls
