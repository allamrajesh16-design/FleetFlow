import django_filters
from .models import Expense


class ExpenseFilter(django_filters.FilterSet):
    start_date = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    end_date = django_filters.DateFilter(field_name="date", lookup_expr="lte")
    vehicle = django_filters.NumberFilter(field_name="vehicle_id")
    trip = django_filters.NumberFilter(field_name="trip_id")
    category = django_filters.ChoiceFilter(choices=Expense.Category.choices)
    status = django_filters.ChoiceFilter(choices=Expense.Status.choices)

    class Meta:
        model = Expense
        fields = [
            "category",
            "status",
            "vehicle",
            "trip",
            "start_date",
            "end_date",
            "date",
        ]
