import django_filters
from .models import Payment


class CharInFilter(django_filters.BaseInFilter, django_filters.CharFilter):
    pass


class PaymentFilter(django_filters.FilterSet):
    status = CharInFilter(field_name="status", lookup_expr="in")
    customer = django_filters.NumberFilter(field_name="customer_id")
    trip = django_filters.NumberFilter(field_name="trip_id")
    payment_method = django_filters.CharFilter(field_name="payment_method")
    cash_settled = django_filters.BooleanFilter(field_name="cash_settled")
    needs_verification = django_filters.BooleanFilter(field_name="needs_verification")
    cash_to_settle = django_filters.BooleanFilter(method="filter_cash_to_settle")
    date_from = django_filters.DateFilter(field_name="created_at__date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="created_at__date", lookup_expr="lte")
    created_at_gte = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_at_lte = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")

    def filter_cash_to_settle(self, queryset, name, value):
        if value:
            return queryset.filter(
                payment_method=Payment.PaymentMethod.CASH,
                status=Payment.Status.PAID,
                cash_settled=False,
            )
        return queryset

    class Meta:
        model = Payment
        fields = ["status", "payment_method", "cash_settled", "needs_verification", "cash_to_settle"]
