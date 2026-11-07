import React from 'react';

/**
 * Fallback small inline SVG icons for vehicles
 */
export const CarFallbackIcon = ({ size = 48, color = '2563EB' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2 11 2 11.4 2 11.8V16c0 .6.4 1 1 1h2" />
    <circle cx="7" cy="17" r="2" />
    <path d="M9 17h6" />
    <circle cx="17" cy="17" r="2" />
  </svg>
);

export const BikeFallbackIcon = ({ size = 48, color = 'var(--primary)' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="5.5" cy="17.5" r="3.5" />
    <circle cx="18.5" cy="17.5" r="3.5" />
    <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5L9 12l3-3 3.5 3.5" />
    <path d="m12 9 4-3h3" />
  </svg>
);

export const BusIllustration = ({ width = "100%", height = "100%", name = "Bus Transit" }) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, var(--blue-50) 0%, var(--surface) 100%)',
      padding: '20px',
      boxSizing: 'border-box',
    }}
    aria-label={name}
  >
    <svg
      width="72"
      height="72"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 4px 12px var(--primary-glow))' }}
    >
      <rect x="8" y="16" width="64" height="42" rx="8" fill="var(--primary)" />
      <rect x="14" y="24" width="12" height="12" rx="2" fill="#FFFFFF" fillOpacity="0.9" />
      <rect x="30" y="24" width="12" height="12" rx="2" fill="#FFFFFF" fillOpacity="0.9" />
      <rect x="46" y="24" width="20" height="12" rx="2" fill="#FFFFFF" fillOpacity="0.9" />
      <rect x="12" y="44" width="56" height="4" fill="var(--cyan-500)" />
      <circle cx="22" cy="58" r="8" fill="var(--navy-900)" />
      <circle cx="22" cy="58" r="3.5" fill="#FFFFFF" />
      <circle cx="58" cy="58" r="8" fill="var(--navy-900)" />
      <circle cx="58" cy="58" r="3.5" fill="#FFFFFF" />
      <rect x="66" y="42" width="4" height="6" rx="2" fill="#F59E0B" />
    </svg>
    <span
      style={{
        marginTop: '10px',
        fontSize: '0.875rem',
        fontWeight: '600',
        color: 'var(--primary)',
        letterSpacing: '0.02em',
      }}
    >
      {name}
    </span>
  </div>
);

/**
 * Master image registry with fallback mapping
 */
export const images = {
  landingHero: {
    src: '/images/hero-bus.jpg',
    fallback: '/images/hero-fleet.svg',
    alt: 'FleetFlow Modern Transit Coach',
  },
  loginSide: {
    src: '/images/login-side.jpg',
    fallback: ['/images/login-bg.jpg', '/images/hero-fleet.svg'],
    fallbacks: ['/images/login-bg.jpg', '/images/hero-fleet.svg'],
    alt: 'FleetFlow Modern Transit Coach and Fleet Operations',
  },
  registerSide: {
    src: '/images/register-side.jpg',
    fallback: ['/images/register-bg.jpg', '/images/hero-fleet.svg'],
    fallbacks: ['/images/register-bg.jpg', '/images/hero-fleet.svg'],
    alt: 'FleetFlow Connected Transit Network Hub',
  },
  busBooking: {
    src: '/images/bus-card.jpg',
    fallback: ['/images/hero-bus.jpg', '/images/bus-booking.jpg', '/images/hero-fleet.svg'],
    fallbacks: ['/images/hero-bus.jpg', '/images/bus-booking.jpg', '/images/hero-fleet.svg'],
    fallbackIcon: <BusIllustration name="Express Intercity Bus" />,
    alt: 'Bus Ticket Reservation',
  },
  vehicleCar: {
    src: '/images/vehicle-car.jpg',
    fallback: ['/images/hero-fleet.svg'],
    fallbacks: ['/images/hero-fleet.svg'],
    fallbackIcon: <CarFallbackIcon />,
    alt: 'Fleet Passenger Sedan',
  },
  vehicleBike: {
    src: '/images/vehicle-bike.jpg',
    fallback: ['/images/hero-fleet.svg'],
    fallbacks: ['/images/hero-fleet.svg'],
    fallbackIcon: <BikeFallbackIcon />,
    alt: 'Fleet Express Bike',
  },
};

export default images;
