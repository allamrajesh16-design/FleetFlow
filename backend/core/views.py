from django.db import connection
from django.utils import timezone
from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    """
    Public health check endpoint for monitoring, load balancers, and Docker orchestration.
    Validates core application runtime and PostgreSQL database connectivity.
    """
    permission_classes = [AllowAny]
    throttle_classes = []

    @extend_schema(
        tags=["System"],
        summary="Service Health Check",
        description="Verify backend server uptime and active database connectivity.",
        responses={
            200: OpenApiResponse(description="All systems operational"),
            503: OpenApiResponse(description="Database or service failure"),
        },
    )
    def get(self, request):
        now_str = timezone.now().isoformat()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
            db_status = "connected"
            status_code = status.HTTP_200_OK
            service_status = "ok"
        except Exception as e:
            db_status = f"error: {str(e)}"
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            service_status = "unhealthy"

        payload = {
            "status": service_status,
            "database": db_status,
            "version": "1.0.0",
            "timestamp": now_str,
        }
        return Response(payload, status=status_code)
