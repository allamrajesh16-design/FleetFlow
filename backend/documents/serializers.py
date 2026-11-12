from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.upload_security import validate_private_document_file
from drivers.models import Driver
from vehicles.models import Vehicle

from .models import Document


class DocumentRejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=True, min_length=3)


class DocumentSerializer(serializers.ModelSerializer):
    days_left = serializers.IntegerField(read_only=True, allow_null=True)
    expiry_status = serializers.CharField(read_only=True)
    document_number = serializers.CharField(required=False, allow_blank=True, default="")
    expiry_date = serializers.DateField(required=False, allow_null=True)
    vehicle_registration = serializers.CharField(source="vehicle.registration_number", read_only=True)
    driver_name = serializers.SerializerMethodField(read_only=True)
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.full_name", read_only=True)

    class Meta:
        model = Document
        fields = [
            "id",
            "vehicle",
            "vehicle_registration",
            "driver",
            "driver_name",
            "doc_type",
            "document_number",
            "issue_date",
            "expiry_date",
            "file",
            "notes",
            "days_left",
            "expiry_status",
            "review_status",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "rejection_reason",
            "uploaded_by",
            "uploaded_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "days_left",
            "expiry_status",
            "review_status",
            "reviewed_by",
            "reviewed_at",
            "rejection_reason",
            "uploaded_by",
            "created_at",
            "updated_at",
        ]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_driver_name(self, obj):
        if obj.driver and obj.driver.user:
            return obj.driver.user.full_name
        return None

    def validate_file(self, value):
        if value:
            validate_private_document_file(value)
        return value

    def validate(self, attrs):
        vehicle = attrs.get("vehicle") or (self.instance.vehicle if self.instance else None)
        driver = attrs.get("driver") or (self.instance.driver if self.instance else None)
        doc_type = attrs.get("doc_type") or (self.instance.doc_type if self.instance else None)
        issue_date = attrs.get("issue_date") or (self.instance.issue_date if self.instance else None)
        expiry_date = attrs.get("expiry_date") or (self.instance.expiry_date if self.instance else None)

        # Database and business XOR validation: exactly ONE of vehicle or driver
        has_v = bool(vehicle)
        has_d = bool(driver)
        if has_v == has_d:
            raise serializers.ValidationError(
                "Document must specify exactly one of vehicle or driver (cannot specify both, cannot specify neither)."
            )

        if has_v and doc_type not in Document.VEHICLE_DOC_TYPES:
            raise serializers.ValidationError({
                "doc_type": f"Invalid doc_type '{doc_type}' for a vehicle. Allowed: {Document.VEHICLE_DOC_TYPES}"
            })

        if has_d and doc_type not in Document.DRIVER_DOC_TYPES:
            raise serializers.ValidationError({
                "doc_type": f"Invalid doc_type '{doc_type}' for a driver. Allowed: {Document.DRIVER_DOC_TYPES}"
            })

        if doc_type != Document.DocType.PROFILE_PHOTO and not expiry_date:
            raise serializers.ValidationError({
                "expiry_date": "Expiry date is required for this document type."
            })

        doc_num = attrs.get("document_number") if "document_number" in attrs else (self.instance.document_number if self.instance else "")
        if doc_type != Document.DocType.PROFILE_PHOTO and not doc_num:
            raise serializers.ValidationError({
                "document_number": "Document number is required for this document type."
            })

        if issue_date and expiry_date and issue_date > expiry_date:
            raise serializers.ValidationError({
                "issue_date": "Issue date cannot be later than expiry date."
            })

        request = self.context.get("request")
        user = request.user if request else None
        if user and user.role == "DRIVER":
            driver_profile = getattr(user, "driver_profile", None)
            if not driver_profile:
                raise serializers.ValidationError("No driver profile associated with this account.")
            if driver and driver != driver_profile:
                raise serializers.ValidationError({"driver": "Drivers can only upload their own driver documents."})
            if vehicle:
                from trips.models import Trip
                has_trip = Trip.objects.filter(driver=driver_profile, vehicle=vehicle).exists()
                if not has_trip:
                    raise serializers.ValidationError({"vehicle": "You can only upload documents for a vehicle you drive on one of your trips."})

            # Duplicate upload restriction: prevent uploading a document type that already exists
            # Only block on CREATE (self.instance is None), not on update/replace
            if self.instance is None and driver and doc_type:
                already_exists = Document.objects.filter(
                    driver=driver,
                    doc_type=doc_type,
                ).exists()
                if already_exists:
                    raise serializers.ValidationError({
                        "detail": (
                            f"A {dict(Document.DocType.choices).get(doc_type, doc_type)} document already exists "
                            f"for this driver. Duplicate uploads are not allowed. "
                            f"Contact your manager if the document needs to be updated."
                        )
                    })

        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["uploaded_by"] = request.user
        return super().create(validated_data)
