import django_filters
from .models import FuelLog


class FuelLogFilter(django_filters.FilterSet):
    start_date = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    end_date = django_filters.DateFilter(field_name="date", lookup_expr="lte")
    vehicle = django_filters.NumberFilter(field_name="vehicle_id")
    driver = django_filters.NumberFilter(field_name="driver_id")
    trip = django_filters.NumberFilter(field_name="trip_id")
    fuel_type = django_filters.ChoiceFilter(choices=FuelLog.FuelType.choices)
    review_status = django_filters.ChoiceFilter(choices=FuelLog.ReviewStatus.choices)
    is_full_tank = django_filters.BooleanFilter()

    class Meta:
        model = FuelLog
        fields = [
            "vehicle",
            "driver",
            "trip",
            "fuel_type",
            "review_status",
            "is_full_tank",
            "start_date",
            "end_date",
            "date",
        ]
