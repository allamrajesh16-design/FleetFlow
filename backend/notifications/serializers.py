from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for Notification representation."""

    class Meta:
        model = Notification
        fields = [
            "id",
            "title",
            "message",
            "type",
            "item_type",
            "item_id",
            "is_read",
            "created_at",
        ]
        read_only_fields = ["id", "title", "message", "type", "item_type", "item_id", "created_at"]
