import django_filters
from .models import Trip


class TripFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status")
    driver = django_filters.NumberFilter(field_name="driver_id")
    vehicle = django_filters.NumberFilter(field_name="vehicle_id")
    date_from = django_filters.DateFilter(field_name="scheduled_datetime__date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="scheduled_datetime__date", lookup_expr="lte")
    scheduled_date = django_filters.DateFilter(field_name="scheduled_datetime__date")
    scheduled_datetime_gte = django_filters.DateTimeFilter(field_name="scheduled_datetime", lookup_expr="gte")
    scheduled_datetime_lte = django_filters.DateTimeFilter(field_name="scheduled_datetime", lookup_expr="lte")

    class Meta:
        model = Trip
        fields = ["status", "driver", "vehicle"]
