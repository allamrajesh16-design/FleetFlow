from datetime import timedelta
import django_filters
from django.utils import timezone
from .models import Document


class DocumentFilter(django_filters.FilterSet):
    vehicle = django_filters.NumberFilter(field_name="vehicle_id")
    driver = django_filters.NumberFilter(field_name="driver_id")
    doc_type = django_filters.ChoiceFilter(choices=Document.DocType.choices)
    review_status = django_filters.ChoiceFilter(choices=Document.ReviewStatus.choices)
    expiry_status = django_filters.ChoiceFilter(
        choices=Document.ExpiryStatus.choices,
        method="filter_expiry_status",
    )
    expiring_in_days = django_filters.NumberFilter(
        method="filter_expiring_in_days",
    )

    class Meta:
        model = Document
        fields = [
            "vehicle",
            "driver",
            "doc_type",
            "review_status",
            "expiry_status",
            "expiring_in_days",
        ]

    def filter_expiry_status(self, queryset, name, value):
        today = timezone.localdate()
        threshold_30 = today + timedelta(days=30)
        if value == Document.ExpiryStatus.EXPIRED:
            return queryset.filter(expiry_date__lt=today)
        elif value == Document.ExpiryStatus.EXPIRING_SOON:
            return queryset.filter(expiry_date__gte=today, expiry_date__lte=threshold_30)
        elif value == Document.ExpiryStatus.VALID:
            return queryset.filter(expiry_date__gt=threshold_30)
        return queryset

    def filter_expiring_in_days(self, queryset, name, value):
        if value is None:
            return queryset
        today = timezone.localdate()
        target_date = today + timedelta(days=int(value))
        return queryset.filter(expiry_date__gte=today, expiry_date__lte=target_date)
