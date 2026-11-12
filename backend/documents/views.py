import logging
from datetime import timedelta
import mimetypes
import os
from django.db import models
from django.http import FileResponse, Http404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from accounts.models import User
from core.upload_security import private_file_storage
from drivers.models import Driver
from notifications.models import Notification, notify
from trips.models import Trip
from vehicles.models import Vehicle

from .filters import DocumentFilter
from .models import Document
from .permissions import DocumentPermission, can_view_document, get_driver_accessible_vehicle_ids
from .serializers import DocumentSerializer, DocumentRejectSerializer
from .services import check_and_notify_expired_documents

logger = logging.getLogger(__name__)


class StandardPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


@extend_schema_view(
    list=extend_schema(
        tags=["Documents"],
        summary="List documents",
        description="List compliance documents. Admin and Fleet Managers view all; Drivers view only their own documents.",
    ),
    create=extend_schema(
        tags=["Documents"],
        summary="Upload document",
        description="Upload a compliance document for a Vehicle or Driver (Admin and Fleet Manager only).",
    ),
    retrieve=extend_schema(
        tags=["Documents"],
        summary="Retrieve document",
        description="Get specific document metadata.",
    ),
    update=extend_schema(
        tags=["Documents"],
        summary="Update document",
        description="Update document details (Admin and Fleet Manager only).",
    ),
    partial_update=extend_schema(
        tags=["Documents"],
        summary="Partial update document",
        description="Partially update document fields.",
    ),
    destroy=extend_schema(
        tags=["Documents"],
        summary="Delete document",
        description="Delete a document (Admin only).",
    ),
)
class DocumentViewSet(viewsets.ModelViewSet):
    """ViewSet for vehicle and driver document compliance management."""

    queryset = (
        Document.objects.all()
        .select_related("vehicle", "driver", "driver__user", "uploaded_by")
    )
    serializer_class = DocumentSerializer
    permission_classes = [DocumentPermission]
    pagination_class = StandardPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = DocumentFilter
    search_fields = [
        "vehicle__registration_number",
        "driver__user__full_name",
        "document_number",
    ]
    ordering_fields = ["expiry_date", "issue_date", "created_at"]
    ordering = ["expiry_date", "-created_at"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Document.objects.none()

        if user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or user.is_superuser:
            return self.queryset

        if user.role == User.Role.DRIVER:
            driver_profile = getattr(user, "driver_profile", None)
            if driver_profile:
                # Include driver documents and documents for vehicles driven by driver on trips within policy
                driven_vehicle_ids = get_driver_accessible_vehicle_ids(driver_profile)
                return self.queryset.filter(
                    models.Q(driver=driver_profile) |
                    models.Q(driver__user=user) |
                    models.Q(vehicle_id__in=driven_vehicle_ids) |
                    models.Q(uploaded_by=user)
                ).distinct()
            return Document.objects.none()

        return Document.objects.none()

    def list(self, request, *args, **kwargs):
        user = request.user
        if user.is_authenticated and (user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or user.is_superuser):
            try:
                check_and_notify_expired_documents()
            except Exception as e:
                logger.error("Error checking expired documents on list: %s", e)
        return super().list(request, *args, **kwargs)

    @extend_schema(
        tags=["Documents"],
        summary="Approve document",
        description="Approve a pending document (Admin and Fleet Manager only).",
    )
    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can approve documents."},
                status=status.HTTP_403_FORBIDDEN,
            )
        document = self.get_object()
        document.review_status = Document.ReviewStatus.APPROVED
        document.reviewed_by = request.user
        document.reviewed_at = timezone.now()
        document.rejection_reason = ""
        document.save(update_fields=["review_status", "reviewed_by", "reviewed_at", "rejection_reason"])

        # Notify driver
        target_user = document.uploaded_by or (document.driver.user if document.driver else None)
        if target_user:
            notify(
                user=target_user,
                title="Document Approved",
                message=f"Your {document.get_doc_type_display()} document has been approved.",
                type=Notification.NotificationType.SYSTEM,
                item_type="document",
                item_id=document.id,
            )

        return Response(DocumentSerializer(document).data)

    @extend_schema(
        tags=["Documents"],
        summary="Reject document",
        description="Reject a pending document with a required reason (Admin and Fleet Manager only).",
        request=DocumentRejectSerializer,
    )
    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "Only Admin and Fleet Manager can reject documents."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = DocumentRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["rejection_reason"]

        document = self.get_object()
        document.review_status = Document.ReviewStatus.REJECTED
        document.reviewed_by = request.user
        document.reviewed_at = timezone.now()
        document.rejection_reason = reason
        document.save(update_fields=["review_status", "reviewed_by", "reviewed_at", "rejection_reason"])

        # Notify driver
        target_user = document.uploaded_by or (document.driver.user if document.driver else None)
        if target_user:
            notify(
                user=target_user,
                title="Document Rejected",
                message=f"Your {document.get_doc_type_display()} document was rejected: {reason}",
                type=Notification.NotificationType.SYSTEM,
                item_type="document",
                item_id=document.id,
            )

        return Response(DocumentSerializer(document).data)

    @extend_schema(
        tags=["Documents"],
        summary="Driver targets for document upload",
        description="List targets for driver document upload: the driver's own profile and vehicles driven on their trips.",
    )
    @action(detail=False, methods=["get"], url_path="my-targets")
    def my_targets(self, request):
        if request.user.role != User.Role.DRIVER:
            return Response({"detail": "Only drivers can access my-targets."}, status=status.HTTP_403_FORBIDDEN)
        driver_profile = getattr(request.user, "driver_profile", None)
        if not driver_profile:
            return Response({"detail": "No driver profile found."}, status=status.HTTP_400_BAD_REQUEST)

        # Vehicles driven on driver trips
        driven_vehicles = (
            Vehicle.objects.filter(trips__driver=driver_profile)
            .distinct()
            .values("id", "registration_number", "brand", "model", "vehicle_type")
        )

        return Response({
            "driver": {
                "id": driver_profile.id,
                "name": request.user.full_name,
                "license_number": driver_profile.license_number,
                "allowed_doc_types": [
                    {"value": t[0], "label": t[1]}
                    for t in Document.DocType.choices
                    if t[0] in Document.DRIVER_DOC_TYPES
                ],
            },
            "vehicles": list(driven_vehicles),
            "vehicle_allowed_doc_types": [
                {"value": t[0], "label": t[1]}
                for t in Document.DocType.choices
                if t[0] in Document.VEHICLE_DOC_TYPES
            ],
        })

    @extend_schema(
        tags=["Documents"],
        summary="Download document file",
        description="Securely download document file from private storage (Admin, Fleet Manager, or assigned Driver).",
    )
    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, pk=None):
        user = request.user
        if not user or not user.is_authenticated:
            return Response(
                {"detail": "Authentication credentials were not provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if user.role == User.Role.CUSTOMER:
            return Response(
                {"detail": "You do not have permission to download this document."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            document = Document.objects.select_related("driver", "driver__user", "vehicle", "uploaded_by").get(pk=pk)
        except Document.DoesNotExist:
            raise Http404("Document not found.")

        if user.role == User.Role.DRIVER:
            if not can_view_document(user, document):
                # 404 for driver to not leak document existence
                raise Http404("Document not found.")
        elif not can_view_document(user, document):
            return Response(
                {"detail": "You do not have permission to download this document."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not document.file:
            raise Http404("No file attached to this document.")

        try:
            file_handle = private_file_storage.open(document.file.name, "rb")
        except Exception:
            raise Http404("Document file not found on disk.")

        filename = os.path.basename(document.file.name)
        content_type, _ = mimetypes.guess_type(filename)
        inline = request.query_params.get("inline", "").lower() in ("true", "1", "yes")
        return FileResponse(
            file_handle,
            content_type=content_type or "application/octet-stream",
            as_attachment=not inline,
            filename=filename,
        )

    @extend_schema(
        tags=["Documents"],
        summary="Expiring documents list",
        description="List all documents and driver licenses that are expired or expiring within the next 30 days (Admin and Fleet Manager only).",
    )
    @action(detail=False, methods=["get"], url_path="expiring")
    def expiring(self, request):
        if not (request.user.role in [User.Role.ADMIN, User.Role.FLEET_MANAGER] or request.user.is_superuser):
            return Response(
                {"detail": "You do not have permission to view expiring documents."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Trigger automatic check & notification for any expired documents
        try:
            check_and_notify_expired_documents()
        except Exception as e:
            logger.error("Error checking expired documents on expiring endpoint: %s", e)

        today = timezone.localdate()
        cutoff_date = today + timedelta(days=30)

        # 1. Compliance Documents (only APPROVED documents)
        docs_qs = Document.objects.filter(
            review_status=Document.ReviewStatus.APPROVED,
            expiry_date__lte=cutoff_date
        ).select_related("vehicle", "driver", "driver__user")

        expiring_list = []
        for doc in docs_qs:
            entity_type = "VEHICLE" if doc.vehicle else "DRIVER"
            entity_name = (
                doc.vehicle.registration_number
                if doc.vehicle
                else (doc.driver.user.full_name if doc.driver and doc.driver.user else "Driver")
            )
            expiring_list.append({
                "type": "DOCUMENT",
                "id": doc.id,
                "entity_type": entity_type,
                "entity_id": doc.vehicle_id or doc.driver_id,
                "entity_name": entity_name,
                "doc_type": doc.doc_type,
                "doc_type_display": doc.get_doc_type_display(),
                "document_number": doc.document_number,
                "expiry_date": doc.expiry_date.isoformat(),
                "days_left": doc.days_left,
                "expiry_status": doc.expiry_status,
            })

        # 2. Driver Licenses from Driver model
        drivers_qs = Driver.objects.filter(
            license_expiry__lte=cutoff_date
        ).select_related("user")

        for d in drivers_qs:
            days_left = (d.license_expiry - today).days
            status_val = (
                Document.ExpiryStatus.EXPIRED if days_left < 0
                else (Document.ExpiryStatus.EXPIRING_SOON if days_left <= 30 else Document.ExpiryStatus.VALID)
            )
            expiring_list.append({
                "type": "DRIVER_LICENSE",
                "id": f"license_{d.id}",
                "driver_id": d.id,
                "entity_type": "DRIVER",
                "entity_id": d.id,
                "entity_name": d.user.full_name if d.user else "Driver",
                "doc_type": "DRIVING_LICENSE",
                "doc_type_display": "Driver License",
                "document_number": d.license_number,
                "expiry_date": d.license_expiry.isoformat(),
                "days_left": days_left,
                "expiry_status": status_val,
            })

        # Sort all items by expiry_date ascending
        expiring_list.sort(key=lambda x: x["expiry_date"])

        return Response({
            "count": len(expiring_list),
            "results": expiring_list,
        })
