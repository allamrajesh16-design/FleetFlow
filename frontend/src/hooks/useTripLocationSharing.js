import { useState, useEffect, useRef, useCallback } from 'react';
import { sendTripLocationApi } from '../api/driver';

/**
 * Hook for live driver GPS location sharing during IN_PROGRESS trips.
 *
 * Requirements:
 * 1. Request browser/device location permission.
 * 2. Start GPS location sharing.
 * 3. Capture latitude, longitude, timestamp, speed and heading when available.
 * 4. Send location updates securely to the Django backend.
 * 5. Make the latest driver location available to the Fleet Manager Trip Monitoring map.
 * 6. Display GPS status: Connected, Updating, Permission Denied or Location Unavailable.
 * 7. Display the last location update time.
 * 8. Stop active location sharing when the trip is completed.
 * 9. Preserve location history for completed trips when available.
 */
export function useTripLocationSharing(tripId, isTripInProgress) {
  // Status: 'CONNECTED' | 'UPDATING' | 'PERMISSION_DENIED' | 'LOCATION_UNAVAILABLE' | 'OFF'
  const [gpsStatus, setGpsStatus] = useState(isTripInProgress ? 'UPDATING' : 'OFF');
  const [sharingActive, setSharingActive] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [locationUnavailable, setLocationUnavailable] = useState(false);
  const [lastCoords, setLastCoords] = useState(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const [retryCounter, setRetryCounter] = useState(0);

  const lastSentRef = useRef(null);
  const intervalRef = useRef(null);
  const watchIdRef = useRef(null);

  const retryLocation = useCallback(() => {
    setPermissionDenied(false);
    setLocationUnavailable(false);
    setGpsStatus('UPDATING');
    setRetryCounter((c) => c + 1);
  }, []);

  const sendLocation = useCallback(
    async (coords) => {
      if (!tripId || !isTripInProgress || !coords) return;

      const { latitude, longitude, speed_kmh, heading, accuracy_m } = coords;

      // Skip send if coordinates haven't changed meaningfully and we sent recently (< 10s)
      if (lastSentRef.current) {
        const dLat = Math.abs(lastSentRef.current.lat - latitude);
        const dLng = Math.abs(lastSentRef.current.lng - longitude);
        const timeDiff = Date.now() - (lastSentRef.current.time || 0);
        if (dLat < 0.00005 && dLng < 0.00005 && timeDiff < 10000) {
          return;
        }
      }

      setGpsStatus('UPDATING');

      try {
        await sendTripLocationApi(tripId, latitude, longitude, { speed_kmh, heading, accuracy_m });
        lastSentRef.current = { lat: latitude, lng: longitude, time: Date.now() };
        setSharingActive(true);
        setPermissionDenied(false);
        setLocationUnavailable(false);
        setGpsStatus('CONNECTED');
        setLastUpdateTime(new Date());
      } catch (err) {
        // Silently capture transmission errors without blocking driver workflow
        console.warn('Location ping failed:', err.message);
        // If we haven't connected yet, keep status as updating / retrying
      }
    },
    [tripId, isTripInProgress]
  );

  useEffect(() => {
    if (!isTripInProgress || !tripId) {
      setSharingActive(false);
      setGpsStatus('OFF');
      return;
    }

    if (!navigator.geolocation) {
      setPermissionDenied(false);
      setLocationUnavailable(true);
      setGpsStatus('LOCATION_UNAVAILABLE');
      return;
    }

    let isSubscribed = true;

    const parseCoords = (position) => {
      const { coords, timestamp } = position;
      const speed_kmh =
        coords.speed != null && !isNaN(coords.speed) && coords.speed >= 0
          ? Number((coords.speed * 3.6).toFixed(1))
          : null;
      const heading =
        coords.heading != null && !isNaN(coords.heading) && coords.heading >= 0
          ? Number(coords.heading.toFixed(1))
          : null;
      const accuracy_m =
        coords.accuracy != null && !isNaN(coords.accuracy)
          ? Number(coords.accuracy.toFixed(1))
          : null;

      return {
        latitude: coords.latitude,
        longitude: coords.longitude,
        speed_kmh,
        heading,
        accuracy_m,
        timestamp: timestamp || Date.now(),
      };
    };

    // Request current position and track updates
    const onPositionSuccess = (position) => {
      if (!isSubscribed) return;
      const coords = parseCoords(position);
      setLastCoords(coords);
      setPermissionDenied(false);
      setLocationUnavailable(false);
      sendLocation(coords);
    };

    const onPositionError = (error) => {
      if (!isSubscribed) return;
      if (error.code === 1) {
        // PERMISSION_DENIED
        setPermissionDenied(true);
        setLocationUnavailable(false);
        setSharingActive(false);
        setGpsStatus('PERMISSION_DENIED');
      } else if (error.code === 2 || error.code === 3) {
        // POSITION_UNAVAILABLE or TIMEOUT
        setLocationUnavailable(true);
        setSharingActive(false);
        setGpsStatus('LOCATION_UNAVAILABLE');
      }
    };

    // Prompt user / get initial location
    setGpsStatus('UPDATING');
    navigator.geolocation.getCurrentPosition(onPositionSuccess, onPositionError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000,
    });

    // Watch position
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        onPositionSuccess,
        onPositionError,
        {
          enableHighAccuracy: true,
          maximumAge: 8000,
        }
      );
    } catch (e) {
      // Fallback to interval
    }

    // Regular interval: ping location every 15 seconds
    intervalRef.current = setInterval(() => {
      if (document.hidden) return;
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!isSubscribed) return;
            const coords = parseCoords(pos);
            setLastCoords(coords);
            sendLocation(coords);
          },
          (err) => {
            if (!isSubscribed) return;
            if (err.code === 1) {
              setPermissionDenied(true);
              setGpsStatus('PERMISSION_DENIED');
            } else {
              setLocationUnavailable(true);
              setGpsStatus('LOCATION_UNAVAILABLE');
            }
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      }
    }, 15000);

    return () => {
      isSubscribed = false;
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [tripId, isTripInProgress, sendLocation, retryCounter]);

  return {
    gpsStatus,
    sharingActive,
    permissionDenied,
    locationUnavailable,
    lastCoords,
    lastUpdateTime,
    retryLocation,
  };
}
