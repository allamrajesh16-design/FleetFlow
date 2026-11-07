import React from 'react';
import './SignatureDesign.css';

/**
 * RouteLine - Signature design element connecting Source to Destination
 * Features a start dot, dashed road line, progress vehicle position (optional), and destination diamond.
 */
export function RouteLine({
  source = '',
  destination = '',
  progressPercent = null, // e.g. 45 for 45% along route
  vehicleType = 'CAR', // CAR | BUS | BIKE | VAN
  compact = false,
  className = '',
}) {
  const getVehicleIcon = () => {
    switch (String(vehicleType).toUpperCase()) {
      case 'BUS':
        return '🚌';
      case 'BIKE':
        return '🛵';
      case 'VAN':
        return '🚐';
      default:
        return '🚗';
    }
  };

  return (
    <div className={`route-line-container ${compact ? 'compact' : ''} ${className}`}>
      <div className="route-line-track">
        <span className="route-point start" title={source || 'Source'}>
          <span className="route-dot" />
        </span>

        <div className="route-road">
          <div className="route-road-dash" />
          {progressPercent !== null && progressPercent >= 0 && progressPercent <= 100 && (
            <div
              className="route-vehicle-marker"
              style={{ left: `${progressPercent}%` }}
              title={`${progressPercent}% completed`}
            >
              <span className="route-vehicle-icon">{getVehicleIcon()}</span>
            </div>
          )}
        </div>

        <span className="route-point end" title={destination || 'Destination'}>
          <span className="route-diamond" />
        </span>
      </div>

      {(source || destination) && (
        <div className="route-labels">
          <span className="route-label-source" title={source}>{source || 'Origin'}</span>
          <span className="route-label-dest" title={destination}>{destination || 'Destination'}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Format standard Indian licence plate or return clean text
 * E.g., "WT AP 05 WT 0003" -> "AP 05 WT 0003", "AP05WT0001" -> "AP 05 WT 0001"
 */
export function formatIndianPlate(raw) {
  if (!raw) return '';
  const clean = String(raw).trim().toUpperCase();
  const match = clean.match(/^(?:WT\s*)?([A-Z]{2})\s*([0-9]{1,2})\s*([A-Z]{1,3})\s*([0-9]{4})$/);
  if (match) {
    const [, state, rto, series, num] = match;
    const rtoPadded = rto.padStart(2, '0');
    return `${state} ${rtoPadded} ${series} ${num}`;
  }
  return clean;
}

/**
 * VehiclePlate - Standardized Indian format licence plate chip
 * Features an IND blue strip on left, bold dark monospace letters, and AP-style space grouping.
 */
export function VehiclePlate({
  registrationNumber = '',
  size = 'md', // sm | md | lg
  className = '',
}) {
  if (!registrationNumber) return <span className="text-muted">—</span>;

  const formatted = formatIndianPlate(registrationNumber);

  return (
    <span className={`vehicle-plate-chip plate-${size} ${className}`} title={formatted}>
      <span className="plate-ind-strip">
        <span className="plate-chakra-dot" />
        <span className="plate-ind-text">IND</span>
      </span>
      <span className="plate-number-text">{formatted}</span>
    </span>
  );
}

/**
 * StatusDot - A crisp status dot indicator with glowing ring
 */
export function StatusDot({
  status = 'active', // active | pending | scheduled | completed | cancelled | maintenance
  label = '',
  className = '',
}) {
  const s = String(status).toLowerCase();
  return (
    <span className={`status-dot-wrapper status-${s} ${className}`}>
      <span className="status-dot-circle" />
      {label && <span className="status-dot-label">{label}</span>}
    </span>
  );
}

/**
 * DriverChip - Driver avatar with an interactive status ring
 */
export function DriverChip({
  name = 'Driver',
  status = 'free', // free (green) | on_trip (orange) | offline / off (grey)
  avatarUrl = null,
  size = 'md', // sm | md | lg
  showName = true,
  className = '',
}) {
  const s = String(status).toLowerCase();
  const initials = name
    ? name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'DR';

  return (
    <div className={`driver-chip size-${size} status-${s} ${className}`} title={`${name} (${status})`}>
      <div className="driver-avatar-ring">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="driver-avatar-img" />
        ) : (
          <span className="driver-avatar-initials">{initials}</span>
        )}
        <span className="driver-status-pip" />
      </div>
      {showName && <span className="driver-chip-name">{name}</span>}
    </div>
  );
}

/**
 * OdometerDisplay - Mechanical digit tiles display for odometer and distance readings
 */
export function OdometerDisplay({
  value = 0,
  unit = 'km',
  digits = 6,
  className = '',
}) {
  const num = Math.max(0, parseInt(value, 10) || 0);
  const formatted = String(num).padStart(digits, '0');
  const tiles = formatted.split('');

  return (
    <div className={`odometer-display ${className}`} title={`${num} ${unit}`}>
      <div className="odometer-tiles">
        {tiles.map((digit, idx) => (
          <span key={idx} className={`odometer-tile ${idx === tiles.length - 1 ? 'last-digit' : ''}`}>
            {digit}
          </span>
        ))}
      </div>
      {unit && <span className="odometer-unit">{unit}</span>}
    </div>
  );
}

/**
 * ExpiryRing - A circular radial gauge showing days left for licences/documents
 */
export function ExpiryRing({
  daysLeft = 0,
  maxDays = 365,
  size = 48,
  stroke = 4,
  label = '',
  className = '',
}) {
  const days = Math.max(0, parseInt(daysLeft, 10) || 0);
  const percent = Math.min(100, Math.max(0, (days / maxDays) * 100));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  let colorClass = 'status-green';
  if (days <= 0) colorClass = 'status-red';
  else if (days <= 30) colorClass = 'status-orange';

  return (
    <div className={`expiry-ring-widget ${colorClass} ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="expiry-svg">
        <circle
          className="expiry-circle-bg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className="expiry-circle-bar"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="expiry-ring-content">
        <span className="expiry-ring-number">{days}</span>
        <span className="expiry-ring-unit">d</span>
      </div>
      {label && <span className="expiry-ring-label">{label}</span>}
    </div>
  );
}

/**
 * TicketCard - Flight/Train style Travel Ticket Card with perforated border
 */
export function TicketCard({
  bookingId = '',
  source = '',
  destination = '',
  travelDate = '',
  passengerCount = 1,
  vehicleType = 'CAR',
  fare = null,
  status = 'CONFIRMED',
  actions = null,
  className = '',
}) {
  return (
    <div className={`ticket-pass-card ${className}`}>
      <div className="ticket-body">
        <div className="ticket-header-row">
          <div className="ticket-booking-ref">
            <span className="ticket-ref-label">PASS</span>
            <span className="ticket-ref-id">{bookingId}</span>
          </div>
          <span className={`ticket-status-pill status-${String(status).toLowerCase()}`}>
            {status}
          </span>
        </div>

        <RouteLine
          source={source}
          destination={destination}
          vehicleType={vehicleType}
          className="ticket-route"
        />

        <div className="ticket-details-grid">
          <div>
            <div className="ticket-detail-label">DATE & TIME</div>
            <div className="ticket-detail-val">{travelDate || '—'}</div>
          </div>
          <div>
            <div className="ticket-detail-label">PASSENGERS</div>
            <div className="ticket-detail-val">{passengerCount} {passengerCount === 1 ? 'Person' : 'People'}</div>
          </div>
          {fare && (
            <div>
              <div className="ticket-detail-label">TOTAL FARE</div>
              <div className="ticket-detail-val fare">₹{fare}</div>
            </div>
          )}
        </div>
      </div>

      <div className="ticket-perforation">
        <div className="ticket-notch notch-left" />
        <div className="ticket-dash-line" />
        <div className="ticket-notch notch-right" />
      </div>

      {actions && (
        <div className="ticket-stub-actions">
          {actions}
        </div>
      )}
    </div>
  );
}

