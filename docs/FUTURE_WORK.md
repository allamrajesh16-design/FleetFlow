# FleetFlow — Future Work & Architectural Roadmap

This document outlines the current feature completeness of FleetFlow and details architectural enhancements, deferred capabilities, and roadmap items identified during the final audit.

---

## 1. Feature Completeness Status

All core operational flows required by the FleetFlow SaaS platform are active, tested, and verified across all four user roles (**ADMIN**, **FLEET_MANAGER**, **DRIVER**, **CUSTOMER**):

| Feature Area | Current Status | Primary Role(s) | Verification |
|---|---|---|---|
| **Vehicle Management** | Complete | Admin, Fleet Manager | CRUD, status toggle, seating capacity, rate/km, min passengers |
| **Driver Management** | Complete | Admin | Account provisioning, license tracking, expiry monitoring |
| **Trip Dispatch Center** | Complete | Fleet Manager, Admin | Booking queues, vehicle & driver availability matching, dispatch notes |
| **Trip Execution & Odometer** | Complete | Driver | Start odometer + photo, complete odometer, live fare calculation |
| **Trip Monitoring & Maps** | Complete | Fleet Manager, Admin | Live telemetry, Leaflet + OSRM routing, real-time heading & speed |
| **Maintenance Tracking** | Complete | Fleet Manager, Admin | Preventive scheduling, cost tracking, vehicle downtime lock |
| **Fuel Management** | Complete | Driver (submit), Manager (review) | Liters, rate/L validation, full-tank mileage calc, approval workflow |
| **Expense Management** | Complete | Driver (submit), Manager (review) | Receipts, categorized toll/parking/repair, approval workflow |
| **Document Compliance** | Complete | Driver (upload), Manager (review) | RC, PUC, Insurance, Driving License, expiry rings & alerts |
| **Customer Booking** | Complete | Customer | Vehicle charter & Bus seat reservations with min-passenger rule |
| **Payment & Receipts** | Complete | Customer, Driver | UPI QR dynamic codes, Cash collection, PDF download, refund flow |
| **Authentication & RBAC** | Complete | All Roles | OTP-based registration, password reset, session inactivity guards |
| **Analytics & Reports** | Complete | Admin, Fleet Manager | Metrics charts, revenue breakdown, cost per km, CSV export |

---

## 2. Identified Roadmap & Future Enhancements

The following items are outside the current single-server demo scope and represent natural enhancements for future enterprise production releases:

### 2.1 Hardware Telematics (OBD-II / CAN Bus)
- **Current State**: Driver location, speed, heading, and GPS accuracy are collected via HTML5 Geolocation API on the driver's device (`useDriverLocation` hook) and transmitted via HTTP telemetry.
- **Future Work**: Integrate dedicated hardware GPS/OBD-II tracking devices (e.g., Teltonika, Concox) publishing directly to an MQTT / TCP broker to capture real-time fuel tank levels, engine diagnostics (DTC codes), battery voltage, and harsh braking events without requiring the driver's phone browser to remain foregrounded.

### 2.2 Native Mobile Push Notifications (FCM / APNS)
- **Current State**: In-app notification bell with periodic polling (30s interval), badge indicators, and Django email backend for email notifications.
- **Future Work**: ServiceWorker-based Web Push Notifications and native Firebase Cloud Messaging (FCM) / Apple Push Notification Service (APNS) for instant background delivery of trip assignment alerts to drivers when mobile screens are locked.

### 2.3 Automated Payment Gateway Webhooks
- **Current State**: Dynamic UPI QR generation with reference verification, simulated gateway callbacks, cash collection by driver with cash-settlement workflow, and downloadable PDF receipts.
- **Future Work**: Integration with production Razorpay / Stripe webhook endpoints with HMAC-SHA256 signature verification for automated, instant bank reconciliations and automated refund processing via bank APIs.

### 2.4 Multi-Stop Route Optimization & Real-Time Traffic
- **Current State**: Point-to-point OSRM routing engine with offline straight-line fallback and Nominatim geocoding cache.
- **Future Work**: Dynamic traveling-salesperson problem (TSP) multi-stop waypoint optimization with live traffic integration (e.g. TomTom / Google Maps Traffic layer) for dynamic ETAs during rush hours.

### 2.5 Multi-Tenant White-Label Enterprise Isolation
- **Current State**: Role-based access control (Admin, Fleet Manager, Driver, Customer) operating within an organization workspace.
- **Future Work**: Schema-level PostgreSQL multi-tenancy (`django-tenants`) allowing distinct corporate fleet operators to brand, configure, and isolate their vehicle pools, billing rates, and staff under custom domain subdomains.

