# FleetFlow Production Deployment Guide

This guide covers production deployment for FleetFlow across Docker Compose, Free Cloud Hosting (Render / Railway), and Linux VPS (Ubuntu with Nginx + Gunicorn).

---

## 1. Local & Staging Deployment (Docker Compose)

### Prerequisites
- Docker & Docker Compose installed.

### Steps
1. Create a root `.env` file from the examples:
   ```bash
   cp backend/.env.example .env
   ```
2. Build and launch all three containers (`db`, `backend`, `frontend`):
   ```bash
   docker compose up -d --build
   ```
3. Run database migrations:
   ```bash
   docker compose exec backend python manage.py migrate
   ```
4. Collect static files:
   ```bash
   docker compose exec backend python manage.py collectstatic --noinput
   ```
5. Verify health:
   ```bash
   curl http://localhost:8000/api/health/
   ```

---

## 2. Free Cloud Hosting (Render / Railway)

### Option A: Railway (One-Click / Web UI)
1. **Provision PostgreSQL**: In Railway dashboard, click **New > Database > Add PostgreSQL**.
2. **Deploy Backend**:
   - Connect your GitHub repository.
   - Set Root Directory to `backend`.
   - Set Build Command: `pip install -r requirements.txt && python manage.py collectstatic --noinput`.
   - Set Start Command: `gunicorn --bind 0.0.0.0:$PORT config.wsgi:application`.
   - Configure environment variables:
     - `DJANGO_SETTINGS_MODULE`: `config.settings_prod`
     - `SECRET_KEY`: Generate a random 50-character string.
     - `JWT_SECRET_KEY`: Generate a random 50-character string.
     - `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: Wire from Railway Postgres plugin.
     - `ALLOWED_HOSTS`: `<your-app>.up.railway.app`
     - `CORS_ALLOWED_ORIGINS`: `https://<your-frontend>.vercel.app`
3. **Deploy Frontend (Vercel / Netlify / Render)**:
   - Root directory: `frontend`.
   - Build command: `npm run build`.
   - Output directory: `build`.
   - Environment variable: `REACT_APP_API_URL=https://<your-app>.up.railway.app/api`.

---

## 3. Production Linux VPS (Ubuntu 22.04 / 24.04 LTS)

### Architecture
- **Web Server / Reverse Proxy**: Nginx
- **WSGI Application Server**: Gunicorn (managed by `systemd`)
- **Database**: PostgreSQL 15+
- **Security / SSL**: Let's Encrypt Certbot, UFW Firewall

### Step 1: Server Setup & Dependencies
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-pip python3-venv postgresql postgresql-contrib nginx curl git
```

### Step 2: Database Configuration
```bash
sudo -u postgres psql
CREATE DATABASE fleetflow_db;
CREATE USER fleetflow_user WITH PASSWORD 'StrongVpsPassword@123';
ALTER ROLE fleetflow_user SET client_encoding TO 'utf8';
ALTER ROLE fleetflow_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE fleetflow_user SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE fleetflow_db TO fleetflow_user;
\q
```

### Step 3: Clone & Virtual Environment
```bash
sudo mkdir -p /var/www/fleetflow
sudo chown $USER:$USER /var/www/fleetflow
cd /var/www/fleetflow
git clone <repository_url> .

# Setup Python venv
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
pip install gunicorn whitenoise
```

### Step 4: Environment Variables
Create `/var/www/fleetflow/backend/.env`:
```ini
DEBUG=False
DJANGO_SETTINGS_MODULE=config.settings_prod
SECRET_KEY=generate-secure-random-key-minimum-50-characters
JWT_SECRET_KEY=generate-jwt-secure-random-key-minimum-50-chars
DB_NAME=fleetflow_db
DB_USER=fleetflow_user
DB_PASSWORD=StrongVpsPassword@123
DB_HOST=127.0.0.1
DB_PORT=5432
ALLOWED_HOSTS=fleetflow.example.com,api.fleetflow.example.com
CORS_ALLOWED_ORIGINS=https://fleetflow.example.com
CSRF_TRUSTED_ORIGINS=https://fleetflow.example.com,https://api.fleetflow.example.com
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
```

### Step 5: Systemd Gunicorn Service
Create `/etc/systemd/system/fleetflow.service`:
```ini
[Unit]
Description=FleetFlow Gunicorn Daemon
After=network.target postgresql.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/fleetflow/backend
EnvironmentFile=/var/www/fleetflow/backend/.env
ExecStart=/var/www/fleetflow/venv/bin/gunicorn \
    --access-logfile /var/www/fleetflow/backend/logs/access.log \
    --error-logfile /var/www/fleetflow/backend/logs/error.log \
    --workers 3 \
    --bind unix:/run/fleetflow.sock \
    config.wsgi:application
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl start fleetflow
sudo systemctl enable fleetflow
```

### Step 6: Nginx Reverse Proxy Configuration
Create `/etc/nginx/sites-available/fleetflow`:
```nginx
server {
    listen 80;
    server_name fleetflow.example.com api.fleetflow.example.com;

    location /api/health/ {
        proxy_pass http://unix:/run/fleetflow.sock;
        proxy_set_header Host $host;
    }

    location /api/ {
        proxy_pass http://unix:/run/fleetflow.sock;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        root /var/www/fleetflow/frontend/build;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/fleetflow /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 7: SSL Certificate (Certbot)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d fleetflow.example.com -d api.fleetflow.example.com
```

### Step 8: Health Verification
```bash
curl -f https://api.fleetflow.example.com/api/health/
# Expected Response: {"status":"ok","database":"connected","version":"1.0.0",...}
```

