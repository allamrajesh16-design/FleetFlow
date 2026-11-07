import django_filters
from .models import Payment


class CharInFilter(django_filters.BaseInFilter, django_filters.CharFilter):
    pass


class PaymentFilter(django_filters.FilterSet):
    status = CharInFilter(field_name="status", lookup_expr="in")
    customer = django_filters.NumberFilter(field_name="customer_id")
    trip = django_filters.NumberFilter(field_name="trip_id")
    payment_method = django_filters.CharFilter(field_name="payment_method")
    date_from = django_filters.DateFilter(field_name="created_at__date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="created_at__date", lookup_expr="lte")
    created_at_gte = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_at_lte = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")

    class Meta:
        model = Payment
        fields = ["status", "payment_method"]
