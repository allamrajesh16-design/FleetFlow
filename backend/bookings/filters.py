import django_filters
from .models import Booking, BusSchedule


class BookingFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status")
    booking_type = django_filters.CharFilter(field_name="booking_type")
    vehicle_type = django_filters.CharFilter(field_name="vehicle_type")
    date_from = django_filters.DateFilter(field_name="travel_datetime__date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="travel_datetime__date", lookup_expr="lte")
    travel_datetime_gte = django_filters.DateTimeFilter(field_name="travel_datetime", lookup_expr="gte")
    travel_datetime_lte = django_filters.DateTimeFilter(field_name="travel_datetime", lookup_expr="lte")
    has_trip = django_filters.BooleanFilter(method="filter_has_trip")

    class Meta:
        model = Booking
        fields = ["status", "booking_type", "vehicle_type", "has_trip"]

    def filter_has_trip(self, queryset, name, value):
        if value is True:
            return queryset.filter(trips__status__in=["SCHEDULED", "IN_PROGRESS"]).distinct()
        elif value is False:
            return queryset.exclude(trips__status__in=["SCHEDULED", "IN_PROGRESS"]).distinct()
        return queryset


class BusScheduleFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status")
    source = django_filters.CharFilter(lookup_expr="icontains")
    destination = django_filters.CharFilter(lookup_expr="icontains")
    departure_date = django_filters.DateFilter(field_name="departure_datetime__date")
    departure_gte = django_filters.DateTimeFilter(field_name="departure_datetime", lookup_expr="gte")
    departure_lte = django_filters.DateTimeFilter(field_name="departure_datetime", lookup_expr="lte")
    has_trip = django_filters.BooleanFilter(method="filter_has_trip")

    class Meta:
        model = BusSchedule
        fields = ["status", "source", "destination", "has_trip"]

    def filter_has_trip(self, queryset, name, value):
        if value is True:
            return queryset.filter(trips__status__in=["SCHEDULED", "IN_PROGRESS"]).distinct()
        elif value is False:
            return queryset.exclude(trips__status__in=["SCHEDULED", "IN_PROGRESS"]).distinct()
        return queryset
