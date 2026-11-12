import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Button from './Button';
import './TripMap.css';

// Fix Leaflet's default icon missing image issues in webpack/cra
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

function formatTimeAgo(isoString) {
  if (!isoString) return 'No signal';
  const sec = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function getVehicleIcon(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'BUS') return '🚌';
  if (t === 'BIKE' || t === 'MOTORCYCLE') return '🏍️';
  return '🚗';
}

function getVehicleSvg(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'BIKE' || t === 'MOTORCYCLE') {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
      <path d="M12 17.5V13l-3-3 5-4 4 3.5h3"/>
      <circle cx="12" cy="6.5" r="1.5" fill="currentColor"/>
    </svg>`;
  }
  if (t === 'BUS') {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="3" width="16" height="16" rx="2.5"/>
      <path d="M4 11h16"/><circle cx="8" cy="15.5" r="1" fill="currentColor"/><circle cx="16" cy="15.5" r="1" fill="currentColor"/><path d="M6 19v2"/><path d="M18 19v2"/>
    </svg>`;
  }
  // Car / Taxi (Rapido Cab & Uber style)
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 16h14a1 1 0 0 0 1-1v-4l-2.5-6.5a1 1 0 0 0-.9-.5H7.4a1 1 0 0 0-.9.5L4 11v4a1 1 0 0 0 1 1z"/>
    <circle cx="7.5" cy="16.5" r="2" fill="currentColor"/>
    <circle cx="16.5" cy="16.5" r="2" fill="currentColor"/>
  </svg>`;
}

function createPinIcon(letter, isPickup) {
  const pinColor = isPickup ? '#10B981' : '#EF4444';
  const label = isPickup ? 'P' : 'D';
  return L.divIcon({
    className: 'rapido-pin-divicon',
    html: `
      <div class="rapido-pin-container" style="--pin-bg: ${pinColor};">
        <div class="rapido-pin-teardrop">
          <span class="rapido-pin-letter">${label}</span>
        </div>
        <div class="rapido-pin-pulse"></div>
      </div>
    `,
    iconSize: [36, 44],
    iconAnchor: [18, 42],
  });
}

function createRouteArrowIcon(angle = 0) {
  return L.divIcon({
    className: 'route-direction-arrow-icon',
    html: `
      <div class="route-arrow-marker" style="transform: rotate(${angle}deg);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 4L4 20L12 16L20 20L12 4Z" fill="#1D4ED8" stroke="#FFFFFF" stroke-width="2"/>
        </svg>
      </div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function createVehicleIcon(vehicleType, heading = 0, isLive = true, isSimulated = false, plate = '', speed = null) {
  const svg = getVehicleSvg(vehicleType);
  const ringState = isLive ? 'live' : 'stale';
  const simBadge = isSimulated ? '<span class="sim-pill">SIM</span>' : '';
  const rot = typeof heading === 'number' && !isNaN(heading) ? heading : 0;
  const speedText = speed != null && speed > 0 ? `${Math.round(speed)} km/h` : null;

  return L.divIcon({
    className: 'rapido-vehicle-divicon',
    html: `
      <div class="rapido-vehicle-marker-wrapper">
        <div class="rapido-vehicle-halo ${ringState}">
          <div class="rapido-heading-arrow" style="transform: rotate(${rot}deg);">
            <div class="rapido-arrow-tip"></div>
          </div>
          <div class="rapido-vehicle-icon-circle">
            ${svg}
          </div>
          ${simBadge}
        </div>
        ${plate || speedText ? `
          <div class="rapido-floating-badge">
            ${plate ? `<span class="rapido-badge-plate">${plate}</span>` : ''}
            ${speedText ? `<span class="rapido-badge-speed">${speedText}</span>` : ''}
          </div>
        ` : ''}
      </div>
    `,
    iconSize: [64, 64],
    iconAnchor: [32, 32],
  });
}

function createOverviewVehicleIcon(vehicle) {
  const symbol = getVehicleIcon(vehicle.vehicle_type);
  const plate = vehicle.plate || vehicle.vehicle_registration || '-';
  const isLive = vehicle.status_flags?.includes('LIVE') ?? vehicle.is_live ?? true;
  const borderColor = isLive ? '#1D4ED8' : '#94A3B8';

  return L.divIcon({
    className: 'overview-vehicle-marker',
    html: `
      <div class="overview-vehicle-pill" style="border-color: ${borderColor};">
        <span>${symbol}</span>
        <span>${plate}</span>
      </div>
    `,
    iconSize: [110, 28],
    iconAnchor: [55, 14],
  });
}

// Controller component inside MapContainer for bounds & view adjustments
function MapController({
  bounds,
  vehiclePos,
  followVehicle,
  setFollowVehicle,
  triggerFit,
  mapInstanceRef,
}) {
  const map = useMap();

  useEffect(() => {
    if (mapInstanceRef) {
      mapInstanceRef.current = map;
    }
  }, [map, mapInstanceRef]);

  // Listen to manual drag: disable follow vehicle
  useEffect(() => {
    const handleDragStart = () => {
      if (followVehicle) {
        setFollowVehicle(false);
      }
    };
    map.on('dragstart', handleDragStart);
    return () => {
      map.off('dragstart', handleDragStart);
    };
  }, [map, followVehicle, setFollowVehicle]);

  // Auto pan to follow vehicle if enabled
  useEffect(() => {
    if (followVehicle && vehiclePos && Array.isArray(vehiclePos)) {
      map.panTo(vehiclePos, { animate: true, duration: 0.8 });
    }
  }, [vehiclePos, followVehicle, map]);

  // Invalidate map size on mount and window resize so Leaflet accurately calculates coordinates
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
    };
    map.invalidateSize();
    const t1 = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(t1);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  // Fit bounds only when route/trip changes or explicit Fit Route button clicked
  const lastFitBoundsKeyRef = useRef('');
  useEffect(() => {
    if (bounds && bounds.isValid && bounds.isValid()) {
      const boundsKey = `${bounds.getNorth().toFixed(4)},${bounds.getSouth().toFixed(4)},${bounds.getEast().toFixed(4)},${bounds.getWest().toFixed(4)}_${triggerFit}`;
      if (boundsKey !== lastFitBoundsKeyRef.current) {
        lastFitBoundsKeyRef.current = boundsKey;
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16, animate: false });
      }
    }
  }, [bounds, triggerFit, map]);

  return null;
}

export default function TripMap({
  trip,
  vehicles = [],
  onSelectTrip,
  isFixPlacesMode = false,
  onFixPlacesChange,
}) {
  const wrapperRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [followVehicle, setFollowVehicle] = useState(false);
  const [triggerFitCount, setTriggerFitCount] = useState(0);

  // Editable pin positions for Fix Places mode
  const [editablePickup, setEditablePickup] = useState(null);
  const [editableDrop, setEditableDrop] = useState(null);

  // Animated vehicle position state
  const [animatedVehiclePos, setAnimatedVehiclePos] = useState(null);
  const animFrameRef = useRef(null);
  const prevVehiclePosRef = useRef(null);

  // Sync editable coordinates with trip
  useEffect(() => {
    if (trip) {
      if (trip.pickup_lat != null && trip.pickup_lng != null) {
        setEditablePickup([Number(trip.pickup_lat), Number(trip.pickup_lng)]);
      }
      if (trip.drop_lat != null && trip.drop_lng != null) {
        setEditableDrop([Number(trip.drop_lat), Number(trip.drop_lng)]);
      }
    }
  }, [trip]);

  // Notify parent of pin changes in fix mode
  const handlePickupDragEnd = useCallback(
    (e) => {
      const { lat, lng } = e.target.getLatLng();
      const newPos = [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
      setEditablePickup(newPos);
      if (onFixPlacesChange) {
        onFixPlacesChange({ pickup: newPos, drop: editableDrop });
      }
    },
    [editableDrop, onFixPlacesChange]
  );

  const handleDropDragEnd = useCallback(
    (e) => {
      const { lat, lng } = e.target.getLatLng();
      const newPos = [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
      setEditableDrop(newPos);
      if (onFixPlacesChange) {
        onFixPlacesChange({ pickup: editablePickup, drop: newPos });
      }
    },
    [editablePickup, onFixPlacesChange]
  );

  // Coordinates from route GeoJSON
  const routeLatLngs = useMemo(() => {
    if (!trip?.route_geojson?.coordinates) return [];
    return trip.route_geojson.coordinates.map(([lon, lat]) => [Number(lat), Number(lon)]);
  }, [trip?.route_geojson]);

  const isStraightRoute = trip?.route_source === 'STRAIGHT' || trip?.geo_status === 'APPROXIMATE';

  // Current real vehicle location from telemetry (with route fallback for in-progress trips)
  const rawVehiclePos = useMemo(() => {
    const loc = trip?.last_location || trip?.last_known_location;
    if (loc?.latitude != null && loc?.longitude != null) {
      return [Number(loc.latitude), Number(loc.longitude)];
    }
    if (loc?.lat != null && loc?.lng != null) {
      return [Number(loc.lat), Number(loc.lng)];
    }
    // Fallback for active IN_PROGRESS trip: place along route according to progress
    if (trip?.status === 'IN_PROGRESS') {
      if (routeLatLngs && routeLatLngs.length > 0) {
        const pct = Math.max(0, Math.min(100, Number(trip.progress_percent) || 0));
        const idx = Math.min(routeLatLngs.length - 1, Math.floor((pct / 100) * (routeLatLngs.length - 1)));
        return routeLatLngs[idx];
      }
      if (trip?.pickup_lat != null && trip?.pickup_lng != null) {
        return [Number(trip.pickup_lat), Number(trip.pickup_lng)];
      }
    }
    return null;
  }, [trip?.last_location, trip?.last_known_location, trip?.status, trip?.progress_percent, trip?.pickup_lat, trip?.pickup_lng, routeLatLngs]);

  // Smooth animation for vehicle movement (1s animation via requestAnimationFrame)
  useEffect(() => {
    if (!rawVehiclePos) {
      setAnimatedVehiclePos(null);
      prevVehiclePosRef.current = null;
      return;
    }

    const prev = prevVehiclePosRef.current;
    if (!prev) {
      // First position: set immediately
      setAnimatedVehiclePos(rawVehiclePos);
      prevVehiclePosRef.current = rawVehiclePos;
      return;
    }

    // If position changed, animate smoothly over 1000ms
    const [startLat, startLng] = prev;
    const [targetLat, targetLng] = rawVehiclePos;

    if (Math.abs(startLat - targetLat) < 0.000001 && Math.abs(startLng - targetLng) < 0.000001) {
      return;
    }

    const startTime = performance.now();
    const duration = 1000;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);

      const curLat = startLat + (targetLat - startLat) * ease;
      const curLng = startLng + (targetLng - startLng) * ease;

      setAnimatedVehiclePos([curLat, curLng]);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        prevVehiclePosRef.current = rawVehiclePos;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [rawVehiclePos]);

  // Split route into travelled & remaining parts
  const { travelledPath, remainingPath } = useMemo(() => {
    if (!routeLatLngs.length || !animatedVehiclePos || isStraightRoute) {
      return { travelledPath: [], remainingPath: routeLatLngs };
    }

    // Find nearest point on route
    const [vLat, vLng] = animatedVehiclePos;
    let nearestIdx = 0;
    let minDist = Infinity;

    for (let i = 0; i < routeLatLngs.length; i++) {
      const [rLat, rLng] = routeLatLngs[i];
      const d = Math.hypot(vLat - rLat, vLng - rLng);
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    }

    const travelled = routeLatLngs.slice(0, nearestIdx + 1);
    travelled.push(animatedVehiclePos);

    const remaining = [animatedVehiclePos, ...routeLatLngs.slice(nearestIdx + 1)];
    return { travelledPath: travelled, remainingPath: remaining };
  }, [routeLatLngs, animatedVehiclePos, isStraightRoute]);

  // Direction arrows along the route (sampled every ~8-12 coordinates)
  const routeDirectionArrows = useMemo(() => {
    if (!routeLatLngs || routeLatLngs.length < 4 || isStraightRoute) return [];
    const arrows = [];
    const step = Math.max(5, Math.floor(routeLatLngs.length / 8));
    for (let i = step; i < routeLatLngs.length - 1; i += step) {
      const [lat1, lng1] = routeLatLngs[i - 1];
      const [lat2, lng2] = routeLatLngs[i + 1] || routeLatLngs[i];
      const dy = lat2 - lat1;
      const dx = Math.cos((lat1 * Math.PI) / 180) * (lng2 - lng1);
      const angle = (Math.atan2(dx, dy) * 180) / Math.PI;
      arrows.push({
        position: routeLatLngs[i],
        angle,
      });
    }
    return arrows;
  }, [routeLatLngs, isStraightRoute]);

  // Compute bounding box for map view (strictly based on static route and endpoints)
  const mapBounds = useMemo(() => {
    const points = [];
    if (editablePickup) points.push(editablePickup);
    if (editableDrop) points.push(editableDrop);
    if (routeLatLngs.length) points.push(...routeLatLngs);

    // If overview mode with multiple vehicles
    if (!trip && vehicles.length) {
      vehicles.forEach((v) => {
        const loc = v.last_location;
        if (loc?.latitude && loc?.longitude) {
          points.push([Number(loc.latitude), Number(loc.longitude)]);
        }
      });
    }

    if (points.length >= 2) {
      return L.latLngBounds(points);
    }
    if (points.length === 1) {
      return L.latLngBounds([
        [points[0][0] - 0.05, points[0][1] - 0.05],
        [points[0][0] + 0.05, points[0][1] + 0.05],
      ]);
    }
    // Default Andhra Pradesh / Kakinada center bounds
    return L.latLngBounds([
      [16.92, 82.18],
      [17.06, 82.32],
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editablePickup, editableDrop, routeLatLngs, trip?.id, vehicles]);

  // Fullscreen toggle handler
  const handleToggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Status flags
  const isLive = trip?.status_flags?.includes('LIVE') ?? trip?.is_live ?? Boolean(animatedVehiclePos);
  const isStale = trip?.status_flags?.includes('STALE') ?? trip?.is_stale ?? false;
  const isNoSignal = trip?.status_flags?.includes('NO_SIGNAL') ?? trip?.is_no_signal ?? !animatedVehiclePos;
  const isOffRoute = trip?.status_flags?.includes('OFF_ROUTE') ?? trip?.is_off_route ?? false;

  return (
    <div className="trip-map-wrapper" ref={wrapperRef}>
      {/* Fix places instructions banner */}
      {isFixPlacesMode && (
        <div className="trip-map-fix-banner">
          <span>📍</span>
          <span>Drag the green pickup (A) or red drop (B) pins to adjust place coordinates.</span>
        </div>
      )}

      {/* Floating Info Chips (Single Trip View) */}
      {trip && (
        <div className="trip-map-floating-chips">
          {/* Signal status chip */}
          {isNoSignal ? (
            <div className="trip-map-chip trip-map-chip-nosignal">
              <span>●</span>
              <span>NO SIGNAL</span>
            </div>
          ) : isStale ? (
            <div className="trip-map-chip trip-map-chip-stale">
              <span>⚠️</span>
              <span>STALE</span>
            </div>
          ) : (
            <div className="trip-map-chip trip-map-chip-live">
              <span className="status-dot"></span>
              <span>LIVE</span>
            </div>
          )}

          {/* Off route warning */}
          {isOffRoute && (
            <div className="trip-map-chip trip-map-chip-offroute">
              <span>⚠️</span>
              <span>OFF ROUTE (&gt;500m)</span>
            </div>
          )}

          {/* Distance left chip */}
          {trip.distance_left_km != null && (
            <div className="trip-map-chip">
              <span>🛣️</span>
              <span>{trip.distance_left_km.toFixed(1)} km left</span>
            </div>
          )}

          {/* ETA chip */}
          {trip.eta_minutes != null && (
            <div className="trip-map-chip">
              <span>⏱️</span>
              <span>
                ETA: {trip.eta_minutes} min {trip.eta_clock ? `(${trip.eta_clock})` : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Floating Map Controls */}
      <div className="trip-map-controls-panel">
        {trip && animatedVehiclePos && (
          <Button
            type="button"
            size="small"
            variant={followVehicle ? 'primary' : 'outline'}
            className="trip-map-control-btn"
            onClick={() => setFollowVehicle(!followVehicle)}
            title="Keep vehicle centered on the map"
          >
            🧭 Follow
          </Button>
        )}
        <Button
          type="button"
          size="small"
          variant="outline"
          className="trip-map-control-btn"
          onClick={() => {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  if (mapInstanceRef.current) {
                    mapInstanceRef.current.setView([pos.coords.latitude, pos.coords.longitude], 15);
                  }
                },
                () => {}
              );
            }
          }}
          title="Pan to My Current Location"
        >
          📍 My Location
        </Button>
        <Button
          type="button"
          size="small"
          variant="outline"
          className="trip-map-control-btn"
          onClick={() => setTriggerFitCount((c) => c + 1)}
          title="Zoom to fit route and places"
        >
          🔍 Fit Route
        </Button>
        <Button
          type="button"
          size="small"
          variant="outline"
          className="trip-map-control-btn"
          onClick={handleToggleFullscreen}
          title="Toggle Fullscreen"
        >
          ⛶
        </Button>
      </div>

      {/* Map Legend */}
      <div className="trip-map-legend">
        <div className="trip-map-legend-item">
          <span className="legend-dot pickup"></span>
          <span>Pickup</span>
        </div>
        <div className="trip-map-legend-item">
          <span className="legend-dot drop"></span>
          <span>Drop</span>
        </div>
        <div className="trip-map-legend-item">
          <span className="legend-swatch route-planned"></span>
          <span>Planned</span>
        </div>
        {travelledPath.length > 0 && (
          <div className="trip-map-legend-item">
            <span className="legend-swatch route-travelled"></span>
            <span>Travelled</span>
          </div>
        )}
      </div>

      <MapContainer
        className="trip-map-container"
        bounds={mapBounds}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapController
          bounds={mapBounds}
          vehiclePos={animatedVehiclePos}
          followVehicle={followVehicle}
          setFollowVehicle={setFollowVehicle}
          triggerFit={triggerFitCount}
          mapInstanceRef={mapInstanceRef}
        />

        {/* 1. Planned Route Polylines */}
        {routeLatLngs.length >= 2 && (
          <>
            {isStraightRoute ? (
              // Straight dashed line fallback
              <Polyline
                positions={routeLatLngs}
                pathOptions={{
                  color: '#94A3B8',
                  weight: 4,
                  dashArray: '8, 8',
                  opacity: 0.85,
                }}
              />
            ) : (
              <>
                {/* High-contrast Navy outer casing (8px wide, Uber/Rapido street route casing) */}
                <Polyline
                  positions={routeLatLngs}
                  pathOptions={{
                    color: '#1E3A8A',
                    weight: 8,
                    opacity: 0.92,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />

                {/* Travelled section (slate grey, 5px wide) */}
                {travelledPath.length >= 2 && (
                  <Polyline
                    positions={travelledPath}
                    pathOptions={{
                      color: '#64748B',
                      weight: 5,
                      opacity: 0.85,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                )}

                {/* Remaining active planned route ribbon (Electric blue, 5px wide) */}
                <Polyline
                  positions={remainingPath.length >= 2 ? remainingPath : routeLatLngs}
                  pathOptions={{
                    color: '#2563EB',
                    weight: 5,
                    opacity: 1,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />

                {/* Route Direction Arrows */}
                {routeDirectionArrows.map((arrow, idx) => (
                  <Marker
                    key={`arrow-${idx}`}
                    position={arrow.position}
                    icon={createRouteArrowIcon(arrow.angle)}
                    interactive={false}
                  />
                ))}
              </>
            )}
          </>
        )}

        {/* 2. Pickup Marker (A - Green Circle) */}
        {editablePickup && (
          <Marker
            position={editablePickup}
            icon={createPinIcon('A', true)}
            draggable={isFixPlacesMode}
            eventHandlers={{
              dragend: handlePickupDragEnd,
            }}
          >
            <Tooltip
              permanent
              direction="top"
              offset={[0, -18]}
              className="trip-map-place-chip pickup-chip"
            >
              {trip?.pickup_location || trip?.source || 'Pickup'}
            </Tooltip>
          </Marker>
        )}

        {/* 3. Drop Marker (B - Red Circle) */}
        {editableDrop && (
          <Marker
            position={editableDrop}
            icon={createPinIcon('B', false)}
            draggable={isFixPlacesMode}
            eventHandlers={{
              dragend: handleDropDragEnd,
            }}
          >
            <Tooltip
              permanent
              direction="bottom"
              offset={[0, 18]}
              className="trip-map-place-chip drop-chip"
            >
              {trip?.drop_location || trip?.destination || 'Drop'}
            </Tooltip>
          </Marker>
        )}

        {/* 4. Single Vehicle Live Marker */}
        {trip && animatedVehiclePos && (
          <Marker
            position={animatedVehiclePos}
            icon={createVehicleIcon(
              trip.vehicle_type,
              trip.last_location?.heading || trip.last_known_location?.heading || 0,
              isLive,
              trip.last_location?.is_simulated || trip.last_known_location?.is_simulated,
              trip.plate || trip.vehicle_registration,
              trip.last_location?.speed_kmh ?? trip.last_location?.speed ?? trip.last_known_location?.speed_kmh
            )}
          >
            <Tooltip direction="top" offset={[0, -22]}>
              <div style={{ fontSize: '11px', lineHeight: '1.4' }}>
                <strong>{trip.plate || trip.vehicle_registration || 'Vehicle'}</strong>
                <div>Driver: {trip.driver_name || 'Assigned Driver'}</div>
                {trip.last_location?.speed_kmh != null && (
                  <div>Speed: {trip.last_location.speed_kmh} km/h</div>
                )}
                <div style={{ color: '#64748B' }}>
                  {formatTimeAgo(trip.last_location?.time || trip.last_location?.recorded_at)}
                </div>
              </div>
            </Tooltip>
          </Marker>
        )}

        {/* 5. Overview Mode: Multiple in-progress vehicles */}
        {!trip &&
          vehicles.map((v) => {
            const loc = v.last_location;
            if (!loc?.latitude || !loc?.longitude) return null;
            const pos = [Number(loc.latitude), Number(loc.longitude)];

            return (
              <Marker
                key={v.id || v.trip_id}
                position={pos}
                icon={createOverviewVehicleIcon(v)}
                eventHandlers={{
                  click: () => onSelectTrip && onSelectTrip(v.id || v.trip_id),
                }}
              >
                <Tooltip direction="top" offset={[0, -16]}>
                  <div style={{ fontSize: '11px' }}>
                    <strong>{v.plate || v.vehicle_registration}</strong> ({v.vehicle_type})
                    <div>Driver: {v.driver_name}</div>
                    <div>Route: {v.source} → {v.destination}</div>
                    <div style={{ color: '#1D4ED8', fontWeight: 600, marginTop: '2px' }}>
                      Click to monitor trip
                    </div>
                  </div>
                </Tooltip>
              </Marker>
            );
          })}
      </MapContainer>
    </div>
  );
}

