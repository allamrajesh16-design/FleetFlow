from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import PaymentViewSet, PaymentQRSettingView

router = DefaultRouter()
router.register(r'', PaymentViewSet, basename='payment')

urlpatterns = [
    path('qr-setting/', PaymentQRSettingView.as_view(), name='payment-qr-setting'),
] + router.urls

