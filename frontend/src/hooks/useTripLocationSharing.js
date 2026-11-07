import { useState, useEffect, useRef, useCallback } from 'react';
import { sendTripLocationApi } from '../api/driver';

/**
 * Hook for live driver GPS location sharing during IN_PROGRESS trips.
 *
 * NOTE: Geolocation works on localhost and HTTPS only in modern browsers.
 *
 * Automatically captures GPS position and sends POST /trips/{id}/location/ every 20 seconds.
 * Skips sending if coordinates have not changed to prevent spamming the API.
 * Stops automatically when the trip is completed or unmounted.
 */
export function useTripLocationSharing(tripId, isTripInProgress) {
  const [sharingActive, setSharingActive] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [lastCoords, setLastCoords] = useState(null);
  const lastSentRef = useRef(null);
  const intervalRef = useRef(null);
  const watchIdRef = useRef(null);

  const sendLocation = useCallback(
    async (coords) => {
      if (!tripId || !isTripInProgress || !coords) return;

      const { latitude, longitude } = coords;

      // Skip send if coordinates haven't changed meaningfully
      if (lastSentRef.current) {
        const dLat = Math.abs(lastSentRef.current.lat - latitude);
        const dLng = Math.abs(lastSentRef.current.lng - longitude);
        if (dLat < 0.00005 && dLng < 0.00005) {
          return;
        }
      }

      try {
        await sendTripLocationApi(tripId, latitude, longitude);
        lastSentRef.current = { lat: latitude, lng: longitude };
        setSharingActive(true);
      } catch (err) {
        // Silently capture transmission errors without blocking driver workflow
        console.warn('Location ping failed:', err.message);
      }
    },
    [tripId, isTripInProgress]
  );

  useEffect(() => {
    if (!isTripInProgress || !tripId) {
      setSharingActive(false);
      return;
    }

    if (!navigator.geolocation) {
      setPermissionDenied(true);
      return;
    }

    let isSubscribed = true;

    // Request current position and track updates
    const onPositionSuccess = (position) => {
      if (!isSubscribed) return;
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setLastCoords(coords);
      setPermissionDenied(false);
      // Immediately send first location ping
      sendLocation(coords);
    };

    const onPositionError = (error) => {
      if (!isSubscribed) return;
      if (error.code === error.PERMISSION_DENIED) {
        setPermissionDenied(true);
      }
      setSharingActive(false);
    };

    // Prompt user / get initial location
    navigator.geolocation.getCurrentPosition(onPositionSuccess, onPositionError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 10000,
    });

    // Watch position
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        onPositionSuccess,
        onPositionError,
        {
          enableHighAccuracy: true,
          maximumAge: 10000,
        }
      );
    } catch (e) {
      // Fallback to interval only
    }

    // Regular interval: ping location every 20 seconds
    intervalRef.current = setInterval(() => {
      if (document.hidden) return;
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            setLastCoords(coords);
            sendLocation(coords);
          },
          (err) => {
            if (err.code === err.PERMISSION_DENIED) {
              setPermissionDenied(true);
            }
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      }
    }, 20000);

    return () => {
      isSubscribed = false;
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [tripId, isTripInProgress, sendLocation]);

  return {
    sharingActive,
    permissionDenied,
    lastCoords,
  };
}
