from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(ListAPIView):
    """List notifications for the logged-in user."""

    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    queryset = Notification.objects.none()

    @extend_schema(
        tags=["Notifications"],
        summary="List user notifications",
        description="Get all notifications for the authenticated user, sorted by newest first.",
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not self.request.user.is_authenticated:
            return Notification.objects.none()
        return Notification.objects.filter(user=self.request.user)


class NotificationMarkReadView(APIView):
    """Mark a specific notification as read."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Notifications"],
        summary="Mark notification as read",
        description="Mark a single notification of the authenticated user as read.",
        request=None,
        responses={
            200: NotificationSerializer,
            404: OpenApiResponse(description="Notification not found."),
        },
    )
    def post(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk, user=request.user)
        except Notification.DoesNotExist:
            return Response(
                {"detail": "Notification not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        notification.is_read = True
        notification.save()
        return Response(NotificationSerializer(notification).data, status=status.HTTP_200_OK)


class NotificationReadAllView(APIView):
    """Mark all notifications of the logged-in user as read."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Notifications"],
        summary="Mark all notifications as read",
        description="Mark all notifications of the authenticated user as read.",
        request=None,
        responses={
            200: OpenApiResponse(description="All notifications marked as read."),
        },
    )
    def post(self, request):
        updated_count = Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response(
            {"message": f"All notifications marked as read ({updated_count} updated)."},
            status=status.HTTP_200_OK,
        )
