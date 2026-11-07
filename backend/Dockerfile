# FleetFlow Backend Dockerfile
FROM python:3.12-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=config.settings_prod

WORKDIR /app

# Install system dependencies including libpq and curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir gunicorn whitenoise

# Copy backend application source
COPY . /app/

# Create runtime directories for logs, media, staticfiles and create unprivileged user
RUN mkdir -p /app/logs /app/media /app/private_media /app/staticfiles && \
    useradd -u 1000 -U -s /bin/sh fleetflow && \
    chown -R fleetflow:fleetflow /app

USER fleetflow

EXPOSE 8000

# Health check probing /api/health/
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/api/health/ || exit 1

# Start Gunicorn WSGI server
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "--threads", "2", "--timeout", "60", "config.wsgi:application"]
