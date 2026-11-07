from django.urls import path
from .views import (
    NotificationListView,
    NotificationMarkReadView,
    NotificationReadAllView,
)

urlpatterns = [
    path('', NotificationListView.as_view(), name='notification_list'),
    path('<int:pk>/read/', NotificationMarkReadView.as_view(), name='notification_mark_read'),
    path('read-all/', NotificationReadAllView.as_view(), name='notification_read_all'),
]
