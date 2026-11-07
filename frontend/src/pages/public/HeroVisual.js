import React from 'react';
import useReveal from '../../hooks/useReveal';
import './HeroVisual.css';

/**
 * HeroVisual
 * Interactive, animated fleet illustration using pure SVG and CSS.
 * - Slow zoom-in on load (scale 1.08 to 1)
 * - Clouds drift
 * - Bus drives along roadway with rotating wheels
 * - Road dashed line advances
 * - Pauses automatically when off-screen or tab is hidden
 */
export default function HeroVisual() {
  const { ref, isVisible } = useReveal({ threshold: 0.1 });

  return (
    <div
      ref={ref}
      className={`hero-visual-wrapper ${isVisible ? 'hero-visual-active' : ''}`}
      role="img"
      aria-label="Animated FleetFlow Bus and Sedan on Highway"
    >
      <div className="hero-visual-inner">
        <svg
          viewBox="0 0 800 480"
          className="hero-svg-canvas"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="hvSky" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#EFF6FF" />
              <stop offset="100%" stopColor="#DBEAFE" />
            </linearGradient>
            <linearGradient id="hvBusBody" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#F8FAFC" />
            </linearGradient>
            <linearGradient id="hvBusBlue" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1D4ED8" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
            <linearGradient id="hvWindow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0F172A" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#1E293B" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="hvCarBody" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#3B82F6" />
            </linearGradient>
            <filter id="hvShadow" x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="12" stdDeviation="16" floodColor="#0B192C" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* Sky Canvas */}
          <rect width="800" height="480" rx="16" fill="url(#hvSky)" />

          {/* Drifting Clouds */}
          <g className="hv-clouds">
            <ellipse cx="140" cy="80" rx="60" ry="22" fill="#FFFFFF" fillOpacity="0.75" />
            <circle cx="170" cy="70" r="30" fill="#FFFFFF" fillOpacity="0.75" />
            <circle cx="125" cy="74" r="24" fill="#FFFFFF" fillOpacity="0.75" />

            <ellipse cx="640" cy="110" rx="70" ry="24" fill="#FFFFFF" fillOpacity="0.7" />
            <circle cx="675" cy="98" r="32" fill="#FFFFFF" fillOpacity="0.7" />
            <circle cx="615" cy="104" r="26" fill="#FFFFFF" fillOpacity="0.7" />
          </g>

          {/* City Skyline */}
          <g className="hv-skyline">
            <rect x="70" y="170" width="60" height="180" rx="4" fill="#BFDBFE" fillOpacity="0.5" />
            <rect x="150" y="130" width="80" height="220" rx="4" fill="#93C5FD" fillOpacity="0.45" />
            <rect x="250" y="190" width="70" height="160" rx="4" fill="#BFDBFE" fillOpacity="0.4" />
            <rect x="520" y="150" width="75" height="200" rx="4" fill="#93C5FD" fillOpacity="0.45" />
            <rect x="615" y="180" width="65" height="170" rx="4" fill="#BFDBFE" fillOpacity="0.5" />
            <rect x="700" y="210" width="50" height="140" rx="4" fill="#93C5FD" fillOpacity="0.35" />
          </g>

          {/* Roadway Base */}
          <rect x="20" y="330" width="760" height="95" rx="12" fill="#0B192C" />

          {/* Moving Road Center Dashes */}
          <g className="hv-road-dashes">
            <line x1="-40" y1="375" x2="840" y2="375" stroke="#F8FAFC" strokeWidth="4" strokeDasharray="32 24" strokeOpacity="0.4" />
          </g>

          {/* Animated Bus Fleet Group (Translates along the road) */}
          <g className="hv-bus-conveyer" filter="url(#hvShadow)">
            <g transform="translate(60, 0)">
              {/* Bus Hull */}
              <path
                d="M70 200 C70 175, 95 170, 130 170 L520 170 C565 170, 580 185, 580 220 L580 330 C580 338, 572 345, 560 345 L85 345 C75 345, 70 338, 70 330 Z"
                fill="url(#hvBusBody)"
              />

              {/* Windshield & Windows */}
              <path d="M510 180 L565 180 C570 180, 574 186, 574 196 L574 250 L510 250 Z" fill="url(#hvWindow)" />
              <rect x="420" y="180" width="75" height="70" rx="6" fill="url(#hvWindow)" />
              <rect x="330" y="180" width="75" height="70" rx="6" fill="url(#hvWindow)" />
              <rect x="240" y="180" width="75" height="70" rx="6" fill="url(#hvWindow)" />
              <rect x="150" y="180" width="75" height="70" rx="6" fill="url(#hvWindow)" />
              <rect x="85" y="180" width="50" height="70" rx="6" fill="url(#hvWindow)" />

              {/* Blue Brand Stripe */}
              <path d="M70 270 L580 270 L580 295 L70 295 Z" fill="url(#hvBusBlue)" />
              <text x="210" y="288" fill="#FFFFFF" fontFamily="system-ui, sans-serif" fontSize="13" fontWeight="800" letterSpacing="2">
                FLEETFLOW EXPRESS
              </text>

              {/* Headlight beam */}
              <polygon points="580,285 660,260 660,335 580,315" fill="#FDE047" fillOpacity="0.25" />
              <circle cx="575" cy="300" r="7" fill="#FEF08A" />

              {/* Rotating Bus Wheels */}
              {/* Rear Wheel */}
              <g className="hv-wheel" style={{ transformOrigin: '160px 345px' }}>
                <circle cx="160" cy="345" r="28" fill="#1E293B" stroke="#0F172A" strokeWidth="5" />
                <circle cx="160" cy="345" r="16" fill="#94A3B8" />
                <line x1="160" y1="329" x2="160" y2="361" stroke="#0F172A" strokeWidth="2" />
                <line x1="144" y1="345" x2="176" y2="345" stroke="#0F172A" strokeWidth="2" />
                <circle cx="160" cy="345" r="6" fill="#2563EB" />
              </g>

              {/* Front Wheel */}
              <g className="hv-wheel" style={{ transformOrigin: '490px 345px' }}>
                <circle cx="490" cy="345" r="28" fill="#1E293B" stroke="#0F172A" strokeWidth="5" />
                <circle cx="490" cy="345" r="16" fill="#94A3B8" />
                <line x1="490" y1="329" x2="490" y2="361" stroke="#0F172A" strokeWidth="2" />
                <line x1="474" y1="345" x2="506" y2="345" stroke="#0F172A" strokeWidth="2" />
                <circle cx="490" cy="345" r="6" fill="#2563EB" />
              </g>
            </g>
          </g>

          {/* Sedan Car in Foreground */}
          <g filter="url(#hvShadow)">
            <g transform="translate(10, 0)">
              <path
                d="M480 300 C500 275, 540 260, 590 260 L650 260 C690 260, 720 280, 735 305 L745 320 C755 325, 755 335, 755 345 L755 360 C755 366, 750 370, 740 370 L470 370 C465 370, 460 366, 460 360 L460 330 C460 315, 470 305, 480 300 Z"
                fill="url(#hvCarBody)"
              />
              <path d="M530 270 L595 270 L595 302 L510 302 Z" fill="url(#hvWindow)" />
              <path d="M605 270 L650 270 C675 270, 695 285, 705 302 L605 302 Z" fill="url(#hvWindow)" />
              <circle cx="742" cy="336" r="5" fill="#FEF08A" />

              {/* Car Wheels */}
              <g className="hv-wheel" style={{ transformOrigin: '515px 370px' }}>
                <circle cx="515" cy="370" r="22" fill="#0F172A" stroke="#334155" strokeWidth="4" />
                <circle cx="515" cy="370" r="12" fill="#E2E8F0" />
                <line x1="515" y1="358" x2="515" y2="382" stroke="#334155" strokeWidth="2" />
                <line x1="503" y1="370" x2="527" y2="370" stroke="#334155" strokeWidth="2" />
                <circle cx="515" cy="370" r="4" fill="#2563EB" />
              </g>

              <g className="hv-wheel" style={{ transformOrigin: '695px 370px' }}>
                <circle cx="695" cy="370" r="22" fill="#0F172A" stroke="#334155" strokeWidth="4" />
                <circle cx="695" cy="370" r="12" fill="#E2E8F0" />
                <line x1="695" y1="358" x2="695" y2="382" stroke="#334155" strokeWidth="2" />
                <line x1="683" y1="370" x2="707" y2="370" stroke="#334155" strokeWidth="2" />
                <circle cx="695" cy="370" r="4" fill="#2563EB" />
              </g>
            </g>
          </g>

          {/* Floating Telemetry Active Chip */}
          <g transform="translate(50, 40)" className="hv-floating-chip">
            <rect width="180" height="46" rx="23" fill="#FFFFFF" filter="url(#hvShadow)" />
            <circle cx="26" cy="23" r="12" fill="#22C55E" />
            <path d="M21 23 L25 27 L32 19" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <text x="46" y="21" fill="#0F172A" fontFamily="system-ui, sans-serif" fontSize="12" fontWeight="700">
              Fleet Active
            </text>
            <text x="46" y="34" fill="#64748B" fontFamily="system-ui, sans-serif" fontSize="10">
              Live GPS Telemetry
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
