from datetime import date, timedelta
from decimal import Decimal
import io
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from documents.models import AlertLog, Document
from drivers.models import Driver
from notifications.models import Notification
from trips.models import Trip
from vehicles.models import Vehicle


class DocumentManagementTests(APITestCase):
    def setUp(self):
        # Users
        self.admin = User.objects.create_superuser(
            email="admin_doc@fleetflow.com",
            password="Demo@12345",
            full_name="Admin Doc",
            role=User.Role.ADMIN,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.manager = User.objects.create_user(
            email="manager_doc@fleetflow.com",
            password="Demo@12345",
            full_name="Manager Doc",
            role=User.Role.FLEET_MANAGER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.driver_user = User.objects.create_user(
            email="driver_doc@fleetflow.com",
            password="Demo@12345",
            full_name="Driver Doc",
            role=User.Role.DRIVER,
            phone="+919876543288",
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.driver_profile = Driver.objects.create(
            user=self.driver_user,
            license_number="DL-DOC-001",
            license_expiry=date.today() + timedelta(days=20),  # expiring soon!
        )
        self.other_driver_user = User.objects.create_user(
            email="other_driver_doc@fleetflow.com",
            password="Demo@12345",
            full_name="Other Driver Doc",
            role=User.Role.DRIVER,
            phone="+919876543287",
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )
        self.other_driver_profile = Driver.objects.create(
            user=self.other_driver_user,
            license_number="DL-DOC-002",
            license_expiry=date.today() + timedelta(days=365),
        )
        self.customer = User.objects.create_user(
            email="customer_doc@fleetflow.com",
            password="Demo@12345",
            full_name="Customer Doc",
            role=User.Role.CUSTOMER,
            is_email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED,
        )

        # Vehicle
        self.vehicle = Vehicle.objects.create(
            registration_number="AP 05 DC 3003",
            vehicle_type=Vehicle.VehicleType.CAR,
            brand="Maruti",
            model="Ertiga",
            seating_capacity=7,
            rate_per_km=Decimal("18.00"),
        )

        self.valid_pdf = SimpleUploadedFile(
            "test_doc.pdf",
            b"%PDF-1.4 header and sample data content",
            content_type="application/pdf",
        )

    def test_exactly_one_of_vehicle_or_driver(self):
        """Document requires exactly one of vehicle or driver (both or neither rejected)."""
        self.client.force_authenticate(user=self.driver_user)

        # Both provided -> rejected
        res_both = self.client.post("/api/documents/", {
            "vehicle": self.vehicle.id,
            "driver": self.driver_profile.id,
            "doc_type": Document.DocType.INSURANCE,
            "document_number": "DOC-XOR-1",
            "expiry_date": (date.today() + timedelta(days=100)).isoformat(),
            "file": SimpleUploadedFile("doc.pdf", b"%PDF-1.4 test", content_type="application/pdf"),
        }, format="multipart")
        self.assertEqual(res_both.status_code, status.HTTP_400_BAD_REQUEST)

        # Neither provided -> rejected
        res_none = self.client.post("/api/documents/", {
            "doc_type": Document.DocType.OTHER,
            "document_number": "DOC-XOR-2",
            "expiry_date": (date.today() + timedelta(days=100)).isoformat(),
            "file": SimpleUploadedFile("doc.pdf", b"%PDF-1.4 test", content_type="application/pdf"),
        }, format="multipart")
        self.assertEqual(res_none.status_code, status.HTTP_400_BAD_REQUEST)

    def test_wrong_file_type_and_fake_extension_are_rejected(self):
        """Files with fake extensions (e.g. .pdf containing random text or exe) are rejected by magic byte check."""
        self.client.force_authenticate(user=self.driver_user)
        # Fake PDF: named .pdf but containing plain text / shell script
        fake_pdf = SimpleUploadedFile(
            "malicious.pdf",
            b"echo 'I am not a real PDF file'",
            content_type="application/pdf",
        )
        res = self.client.post("/api/documents/", {
            "driver": self.driver_profile.id,
            "doc_type": Document.DocType.DRIVING_LICENSE,
            "document_number": "DOC-FAKE-1",
            "expiry_date": (date.today() + timedelta(days=100)).isoformat(),
            "file": fake_pdf,
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_file_over_5mb_is_rejected(self):
        """Files exceeding 5 MB limit are rejected."""
        self.client.force_authenticate(user=self.driver_user)
        large_bytes = b"%PDF-" + b"0" * (5 * 1024 * 1024 + 10)
        large_file = SimpleUploadedFile(
            "large.pdf",
            large_bytes,
            content_type="application/pdf",
        )
        res = self.client.post("/api/documents/", {
            "driver": self.driver_profile.id,
            "doc_type": Document.DocType.DRIVING_LICENSE,
            "document_number": "DOC-LARGE-1",
            "expiry_date": (date.today() + timedelta(days=100)).isoformat(),
            "file": large_file,
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_file_cannot_be_opened_by_direct_media_url_and_download_permissions(self):
        """
        Private files are stored outside MEDIA_ROOT.
        They cannot be opened by /media/ URL.
        Served only by /api/documents/{id}/download/ after role checks.
        """
        self.client.force_authenticate(user=self.driver_user)
        res = self.client.post("/api/documents/", {
            "driver": self.driver_profile.id,
            "doc_type": Document.DocType.DRIVING_LICENSE,
            "document_number": "DL-PRIV-001",
            "expiry_date": (date.today() + timedelta(days=200)).isoformat(),
            "file": SimpleUploadedFile("license.pdf", b"%PDF-1.4 driver license", content_type="application/pdf"),
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        doc_id = res.data["id"]
        doc = Document.objects.get(id=doc_id)

        # File is stored in PRIVATE_MEDIA_ROOT and does not have a direct public URL
        self.assertIsNone(doc.file.url)

        # File cannot be opened by direct public media URL
        media_res = self.client.get(f"/media/{doc.file.name}")
        self.assertEqual(media_res.status_code, status.HTTP_404_NOT_FOUND)

        # Customer download -> 403
        self.client.force_authenticate(user=self.customer)
        c_res = self.client.get(f"/api/documents/{doc_id}/download/")
        self.assertEqual(c_res.status_code, status.HTTP_403_FORBIDDEN)

        # Other driver download -> access denied (403 or 404 filtered queryset)
        self.client.force_authenticate(user=self.other_driver_user)
        o_res = self.client.get(f"/api/documents/{doc_id}/download/")
        self.assertIn(o_res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        # Assigned driver download -> 200 FileResponse
        self.client.force_authenticate(user=self.driver_user)
        d_res = self.client.get(f"/api/documents/{doc_id}/download/")
        self.assertEqual(d_res.status_code, status.HTTP_200_OK)

        # Admin download -> 200 FileResponse
        self.client.force_authenticate(user=self.admin)
        a_res = self.client.get(f"/api/documents/{doc_id}/download/")
        self.assertEqual(a_res.status_code, status.HTTP_200_OK)

    def test_expiry_status_and_days_left_are_correct(self):
        """Verify VALID, EXPIRING_SOON, and EXPIRED statuses and days_left calculations."""
        today = date.today()
        # 1. Expired (10 days ago)
        d_exp = Document(
            vehicle=self.vehicle,
            doc_type=Document.DocType.INSURANCE,
            document_number="EXP-1",
            expiry_date=today - timedelta(days=10),
        )
        self.assertEqual(d_exp.days_left, -10)
        self.assertEqual(d_exp.expiry_status, Document.ExpiryStatus.EXPIRED)

        # 2. Expiring soon (15 days left)
        d_soon = Document(
            vehicle=self.vehicle,
            doc_type=Document.DocType.INSURANCE,
            document_number="SOON-1",
            expiry_date=today + timedelta(days=15),
        )
        self.assertEqual(d_soon.days_left, 15)
        self.assertEqual(d_soon.expiry_status, Document.ExpiryStatus.EXPIRING_SOON)

        # 3. Valid (60 days left)
        d_valid = Document(
            vehicle=self.vehicle,
            doc_type=Document.DocType.INSURANCE,
            document_number="VAL-1",
            expiry_date=today + timedelta(days=60),
        )
        self.assertEqual(d_valid.days_left, 60)
        self.assertEqual(d_valid.expiry_status, Document.ExpiryStatus.VALID)

    def test_expiring_list_includes_driver_licenses(self):
        """GET /api/documents/expiring/ includes documents and Driver license expiry dates."""
        today = date.today()
        # Create an expiring vehicle document
        Document.objects.create(
            vehicle=self.vehicle,
            doc_type=Document.DocType.INSURANCE,
            document_number="INS-EXP-LIST",
            expiry_date=today + timedelta(days=5),
            uploaded_by=self.driver_user,
            review_status=Document.ReviewStatus.APPROVED,
        )

        self.client.force_authenticate(user=self.manager)
        res = self.client.get("/api/documents/expiring/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data["results"]
        # self.driver_profile has license expiring in 20 days -> included
        # vehicle has document expiring in 5 days -> included
        types = [item["type"] for item in results]
        self.assertIn("DOCUMENT", types)
        self.assertIn("DRIVER_LICENSE", types)

    def test_trip_assignment_blocked_with_expired_insurance_and_allowed_when_setting_false(self):
        """Trip assignment is rejected if insurance is expired, and permitted if setting is False."""
        today = date.today()
        # Create expired insurance for self.vehicle
        Document.objects.create(
            vehicle=self.vehicle,
            doc_type=Document.DocType.INSURANCE,
            document_number="INS-BLOCKED",
            expiry_date=today - timedelta(days=2),
            uploaded_by=self.driver_user,
            review_status=Document.ReviewStatus.APPROVED,
        )

        from bookings.models import Booking
        booking = Booking.objects.create(
            customer=self.customer,
            booking_type=Booking.BookingType.VEHICLE,
            vehicle_type=Vehicle.VehicleType.CAR,
            pickup_location="Vizag",
            drop_location="Anakapalle",
            travel_datetime=timezone.now() + timedelta(hours=2),
            status=Booking.Status.APPROVED,
        )

        self.client.force_authenticate(user=self.manager)
        payload = {
            "booking": booking.id,
            "vehicle": self.vehicle.id,
            "driver": self.driver_profile.id,
            "source": "Vizag",
            "destination": "Anakapalle",
            "scheduled_datetime": (timezone.now() + timedelta(hours=2)).isoformat(),
        }

        # 1. Default (BLOCK_TRIPS_ON_EXPIRED_DOCUMENTS = True) -> Rejected
        res_blocked = self.client.post("/api/trips/assign/", payload)
        self.assertEqual(res_blocked.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired documents", res_blocked.data["detail"])

        # 2. When setting is False -> Allowed with warning
        with override_settings(BLOCK_TRIPS_ON_EXPIRED_DOCUMENTS=False):
            res_allowed = self.client.post("/api/trips/assign/", payload)
            self.assertEqual(res_allowed.status_code, status.HTTP_201_CREATED)
            self.assertIn("warnings", res_allowed.data)

    def test_document_alerts_sends_notifications_and_does_not_duplicate_when_run_twice(self):
        """Management command document_alerts sends alerts once per threshold and does not duplicate."""
        today = date.today()
        # Create a document expiring in 5 days (qualifies for threshold 7)
        Document.objects.create(
            driver=self.driver_profile,
            doc_type=Document.DocType.MEDICAL_CERTIFICATE,
            document_number="MED-ALERT-01",
            expiry_date=today + timedelta(days=5),
            uploaded_by=self.admin,
        )

        initial_count = Notification.objects.count()
        out1 = io.StringIO()
        call_command("document_alerts", stdout=out1)
        after_run1_count = Notification.objects.count()
        self.assertGreater(after_run1_count, initial_count)

        # Second run should NOT dispatch any duplicate alerts
        out2 = io.StringIO()
        call_command("document_alerts", stdout=out2)
        after_run2_count = Notification.objects.count()
        self.assertIn("Total notification items dispatched: 0", out2.getvalue())

    def test_check_and_notify_expired_documents_is_idempotent(self):
        """
        services.check_and_notify_expired_documents() must not raise IntegrityError
        when called repeatedly for the same expired document (simulates concurrent
        requests hitting the list / expiring endpoints at the same time).
        """
        from django.db import IntegrityError
        from documents.services import check_and_notify_expired_documents

        today = date.today()
        # Create an already-expired document
        doc = Document.objects.create(
            vehicle=self.vehicle,
            doc_type=Document.DocType.INSURANCE,
            document_number="INS-RACE-001",
            expiry_date=today - timedelta(days=3),
            uploaded_by=self.admin,
            review_status=Document.ReviewStatus.APPROVED,
        )

        # First call: should create AlertLog and NOT raise
        try:
            check_and_notify_expired_documents()
        except IntegrityError:
            self.fail("check_and_notify_expired_documents() raised IntegrityError on first call")

        self.assertEqual(
            AlertLog.objects.filter(document=doc, threshold_days=0, alert_type="EXPIRED").count(),
            1,
            "Exactly one AlertLog should exist after first call",
        )

        # Second call (simulating concurrent / repeated request): must NOT raise IntegrityError
        try:
            check_and_notify_expired_documents()
        except IntegrityError:
            self.fail("check_and_notify_expired_documents() raised IntegrityError on second call (race-condition bug)")

        # Still only one AlertLog row — no duplicates
        self.assertEqual(
            AlertLog.objects.filter(document=doc, threshold_days=0, alert_type="EXPIRED").count(),
            1,
            "AlertLog count must remain 1 after repeated calls (idempotent)",
        )

    def test_document_alerts_command_idempotent_for_expired_document(self):
        """
        Management command document_alerts uses get_or_create so running it twice
        for the same expired document never raises IntegrityError and never creates
        duplicate AlertLog rows.
        """
        from django.db import IntegrityError

        today = date.today()
        # Document already expired
        doc = Document.objects.create(
            vehicle=self.vehicle,
            doc_type=Document.DocType.REGISTRATION_RC,
            document_number="RC-IDEMPOTENT-01",
            expiry_date=today - timedelta(days=1),
            uploaded_by=self.admin,
            review_status=Document.ReviewStatus.APPROVED,
        )

        try:
            out1 = io.StringIO()
            call_command("document_alerts", stdout=out1)
        except IntegrityError:
            self.fail("document_alerts raised IntegrityError on first run")

        # Verify exactly one alert log created
        self.assertEqual(
            AlertLog.objects.filter(document=doc, threshold_days=0, alert_type="DOCUMENT").count(),
            1,
        )

        # Run again — must NOT raise and must NOT create a second row
        try:
            out2 = io.StringIO()
            call_command("document_alerts", stdout=out2)
        except IntegrityError:
            self.fail("document_alerts raised IntegrityError on second (repeated) run")

        self.assertEqual(
            AlertLog.objects.filter(document=doc, threshold_days=0, alert_type="DOCUMENT").count(),
            1,
            "AlertLog must remain 1 row after repeated command runs",
        )

    def test_driver_downloading_other_driver_document_and_customer_get_403(self):
        """A driver downloading another driver's document gets 404 (no existence leak), and a customer gets 403."""
        # Create a document belonging to self.driver_profile
        doc = Document.objects.create(
            driver=self.driver_profile,
            doc_type=Document.DocType.DRIVING_LICENSE,
            document_number="DL-SEC-403",
            expiry_date=date.today() + timedelta(days=180),
            uploaded_by=self.admin,
            file=SimpleUploadedFile("license.pdf", b"%PDF-1.4 sample license data", content_type="application/pdf"),
        )

        # 1. Other driver tries to download -> 404 (does not leak existence)
        self.client.force_authenticate(user=self.other_driver_user)
        res_other_driver = self.client.get(f"/api/documents/{doc.id}/download/")
        self.assertEqual(res_other_driver.status_code, status.HTTP_404_NOT_FOUND)

        # 2. Customer tries to download -> 403
        self.client.force_authenticate(user=self.customer)
        res_customer = self.client.get(f"/api/documents/{doc.id}/download/")
        self.assertEqual(res_customer.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Document owner driver can download -> 200 FileResponse
        self.client.force_authenticate(user=self.driver_user)
        res_owner = self.client.get(f"/api/documents/{doc.id}/download/")
        self.assertEqual(res_owner.status_code, status.HTTP_200_OK)

        # 4. Fleet Manager can download -> 200 FileResponse
        self.client.force_authenticate(user=self.manager)
        res_mgr = self.client.get(f"/api/documents/{doc.id}/download/")
        self.assertEqual(res_mgr.status_code, status.HTTP_200_OK)

    def test_driver_can_download_vehicle_document_from_recent_trip_but_not_old_or_unassigned(self):
        """Driver can download vehicle document if vehicle appeared on recent trip (<60d), but 404 if >60d or unassigned."""
        # Vehicle document
        veh_doc = Document.objects.create(
            vehicle=self.vehicle,
            doc_type=Document.DocType.INSURANCE,
            document_number="INS-VEH-RECENT",
            expiry_date=date.today() + timedelta(days=200),
            uploaded_by=self.admin,
            file=SimpleUploadedFile("ins.pdf", b"%PDF-1.4 insurance file", content_type="application/pdf"),
        )

        # Before any trip: Driver has not driven vehicle -> 404
        self.client.force_authenticate(user=self.driver_user)
        res_unassigned = self.client.get(f"/api/documents/{veh_doc.id}/download/")
        self.assertEqual(res_unassigned.status_code, status.HTTP_404_NOT_FOUND)

        # Create old completed trip (70 days ago) -> still 404
        Trip.objects.create(
            vehicle=self.vehicle,
            driver=self.driver_profile,
            source="A",
            destination="B",
            scheduled_datetime=timezone.now() - timedelta(days=70),
            completed_at=timezone.now() - timedelta(days=70),
            status=Trip.Status.COMPLETED,
        )
        res_old = self.client.get(f"/api/documents/{veh_doc.id}/download/")
        self.assertEqual(res_old.status_code, status.HTTP_404_NOT_FOUND)

        # Create recent trip (completed 10 days ago) -> 200
        Trip.objects.create(
            vehicle=self.vehicle,
            driver=self.driver_profile,
            source="A",
            destination="B",
            scheduled_datetime=timezone.now() - timedelta(days=10),
            completed_at=timezone.now() - timedelta(days=10),
            status=Trip.Status.COMPLETED,
        )
        res_recent = self.client.get(f"/api/documents/{veh_doc.id}/download/")
        self.assertEqual(res_recent.status_code, status.HTTP_200_OK)


