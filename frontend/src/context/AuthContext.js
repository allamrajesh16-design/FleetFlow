import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { loginApi, getProfileApi, logoutApi } from '../api/auth';
import {
  initAuthStorage,
  getStoredToken,
  getStoredUser,
  saveStoredAuth,
  updateStoredUser,
  touchLastActive,
  clearFleetFlowStorage,
  hasStoredSession,
} from '../utils/authStorage';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { PageLoader } from '../components/common/Loader';

const AuthContext = createContext(null);

// Inactivity timeout: 30 minutes total, warning at 29 minutes (60s before)
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const INACTIVITY_WARN_BEFORE_MS = 60 * 1000;

export function getHomePath(role) {
  if (!role) return '/login';
  const r = String(role).toUpperCase();
  switch (r) {
    case 'ADMIN':
      return '/admin/dashboard';
    case 'FLEET_MANAGER':
      return '/manager/dashboard';
    case 'DRIVER':
      return '/driver/dashboard';
    case 'CUSTOMER':
      return '/customer/dashboard';
    default:
      return '/';
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [inactivityWarning, setInactivityWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const lastActivityRef = useRef(Date.now());
  const countdownIntervalRef = useRef(null);
  const handledLogoutIdsRef = useRef(new Set());

  // Restore session on mount
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      // Initialize storage rules: wipe orphaned localStorage tokens if remember was false
      initAuthStorage();

      const token = getStoredToken('fleetflow_access_token');

      if (!token) {
        if (isMounted) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      const savedUser = getStoredUser();
      const savedRole = savedUser?.role;

      // If tokens exist, call GET /auth/profile/
      try {
        const freshProfile = await getProfileApi();
        if (isMounted) {
          const freshRole = freshProfile?.role;
          setUser(freshProfile);
          updateStoredUser(freshProfile);
          touchLastActive();

          // If saved role differs from server role, update it and send user to right dashboard
          if (
            savedRole &&
            freshRole &&
            String(savedRole).toUpperCase() !== String(freshRole).toUpperCase()
          ) {
            navigate(getHomePath(freshRole), { replace: true });
          }
        }
      } catch (err) {
        // Call and auto-refresh failed: clear everything and redirect to login
        clearFleetFlowStorage();
        if (isMounted) {
          setUser(null);
          navigate('/login', {
            replace: true,
            state: { message: 'Please login to continue.' },
          });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  // Master logout function
  const logout = useCallback(
    async (options = {}) => {
      const isCrossTabLogout = !!options.isCrossTabLogout;
      const shouldBroadcast = options.broadcast !== false;

      let logoutId = options.id;
      if (shouldBroadcast && !logoutId) {
        logoutId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        handledLogoutIdsRef.current.add(logoutId);
      }

      try {
        const refreshToken = getStoredToken('fleetflow_refresh_token');

        // Only call backend logout if we initiated it (not a passive receiving tab)
        if (refreshToken && shouldBroadcast) {
          try {
            await logoutApi(refreshToken);
          } catch (e) {
            // ignore error
          }
        }
      } finally {
        // Clear all FleetFlow keys from both localStorage and sessionStorage
        clearFleetFlowStorage();

        // Broadcast logout via BroadcastChannel and storage event ONLY if shouldBroadcast
        if (shouldBroadcast && logoutId) {
          try {
            if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
              const bc = new BroadcastChannel('fleetflow_auth_channel');
              bc.postMessage({ type: 'LOGOUT', id: logoutId, timestamp: Date.now() });
              bc.close();
            }
          } catch (e) {}

          try {
            localStorage.setItem(
              'fleetflow_logout_event',
              JSON.stringify({ id: logoutId, timestamp: Date.now() })
            );
          } catch (e) {}
        }

        // Reset state
        setUser(null);
        setInactivityWarning(false);

        // Stop any custom timers/trackers via custom event and countdown ref
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        window.dispatchEvent(new Event('fleetflow_stop_trackers'));

        // Redirect to /login
        if (!options.silent) {
          const isUserExplicitLogout = options.userInitiated || (!isCrossTabLogout && !options.message && !options.reason);

          if (isUserExplicitLogout) {
            try {
              sessionStorage.setItem('fleetflow_logout_toast', '1');
            } catch (_) {}
            navigate('/login', {
              replace: true,
              state: { logoutSuccess: true },
            });
          } else {
            try {
              sessionStorage.removeItem('fleetflow_logout_toast');
            } catch (_) {}
            navigate('/login', {
              replace: true,
              state: isCrossTabLogout
                ? { message: 'Logged out in another tab.' }
                : options.message
                ? { message: options.message }
                : undefined,
            });
          }
        }
      }
    },
    [navigate]
  );

  // Multi-tab logout listener (storage event and BroadcastChannel)
  useEffect(() => {
    let channel = null;

    const handleCrossTabLogout = (id, timestamp) => {
      if (id) {
        if (handledLogoutIdsRef.current.has(id)) {
          return;
        }
        handledLogoutIdsRef.current.add(id);
      }
      if (timestamp && Date.now() - timestamp > 15000) {
        return;
      }

      // Do NOT send a new logout message; show yellow banner, no toast
      logout({
        broadcast: false,
        silent: false,
        isCrossTabLogout: true,
        showToast: false,
      });
    };

    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        channel = new BroadcastChannel('fleetflow_auth_channel');
        channel.onmessage = (event) => {
          if (event.data?.type === 'LOGOUT') {
            handleCrossTabLogout(event.data.id, event.data.timestamp);
          }
        };
      }
    } catch (e) {}

    const handleStorageEvent = (e) => {
      if (e.key === 'fleetflow_logout_event' && e.newValue) {
        try {
          const payload = JSON.parse(e.newValue);
          handleCrossTabLogout(payload.id, payload.timestamp);
        } catch {}
      } else if (e.key === 'fleetflow_access_token' && !e.newValue) {
        // If access token was cleared externally
        handleCrossTabLogout();
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      if (channel) {
        try {
          channel.close();
        } catch (e) {}
      }
    };
  }, [logout]);

  // Client interceptor auto-logout listener (e.g. refresh failed / expired)
  useEffect(() => {
    const handleAutoLogout = (e) => {
      const message = e.detail?.message || 'Your session expired. Please login again.';
      logout({ message, toastMessage: message });
    };

    window.addEventListener('fleetflow_auth_logout', handleAutoLogout);
    return () => window.removeEventListener('fleetflow_auth_logout', handleAutoLogout);
  }, [logout]);

  // Reset user inactivity timer on interaction
  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (inactivityWarning) {
      setInactivityWarning(false);
      setSecondsLeft(60);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    }
  }, [inactivityWarning]);

  // Setup user activity listeners
  useEffect(() => {
    if (!user) return;

    const handleUserActivity = () => {
      // Throttle activity updates
      const now = Date.now();
      if (now - lastActivityRef.current > 1500) {
        lastActivityRef.current = now;
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));

    // Inactivity check interval
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;

      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        // Log out immediately
        clearInterval(checkInterval);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        logout({ message: 'Your session expired due to inactivity. Please login again.' });
      } else if (elapsed >= INACTIVITY_TIMEOUT_MS - INACTIVITY_WARN_BEFORE_MS) {
        // Show warning 60 seconds before
        if (!inactivityWarning) {
          setInactivityWarning(true);
          const remainingSec = Math.max(
            1,
            Math.ceil((INACTIVITY_TIMEOUT_MS - elapsed) / 1000)
          );
          setSecondsLeft(remainingSec);

          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = setInterval(() => {
            setSecondsLeft((prev) => {
              if (prev <= 1) {
                clearInterval(countdownIntervalRef.current);
                logout({ message: 'Your session expired due to inactivity. Please login again.' });
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
      }
    }, 2000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
      clearInterval(checkInterval);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [user, inactivityWarning, logout]);

  // Login handler with Remember Me support (default false)
  const login = async (credentials, rememberMe = false) => {
    try {
      const data = await loginApi(credentials);

      // Save via centralized auth storage
      saveStoredAuth({
        access: data.access,
        refresh: data.refresh,
        user: data.user,
        remember: !!rememberMe,
      });

      // Always take canonical role and profile from GET /auth/profile/
      let canonicalUser = data.user;
      try {
        const freshProfile = await getProfileApi();
        if (freshProfile && freshProfile.role) {
          canonicalUser = { ...data.user, ...freshProfile };
          updateStoredUser(canonicalUser);
        }
      } catch (profileErr) {
        // Fallback to data.user
      }

      setUser(canonicalUser);
      lastActivityRef.current = Date.now();
      return canonicalUser;
    } catch (err) {
      const errResponse = err.response?.data;
      if (errResponse) {
        if (errResponse.code === 'EMAIL_NOT_VERIFIED') {
          const customErr = new Error(errResponse.message || 'Please verify your email.');
          customErr.code = 'EMAIL_NOT_VERIFIED';
          throw customErr;
        }
        if (errResponse.code === 'APPROVAL_PENDING') {
          const customErr = new Error(errResponse.message || 'Your account is pending approval.');
          customErr.code = 'APPROVAL_PENDING';
          throw customErr;
        }
        if (errResponse.code === 'APPROVAL_REJECTED') {
          const reason = errResponse.rejection_reason || errResponse.reason || '';
          const customErr = new Error(errResponse.message || (reason ? `Your registration was not approved: ${reason}` : 'Your registration was not approved.'));
          customErr.code = 'APPROVAL_REJECTED';
          customErr.rejection_reason = reason;
          throw customErr;
        }
      }
      throw err;
    }
  };

  const updateUser = useCallback((updated) => {
    setUser((prev) => {
      const next = { ...prev, ...updated };
      updateStoredUser(next);
      return next;
    });
  }, []);

  // Synchronize data-role on document root for dynamic role accents
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const r = user?.role ? String(user.role).toLowerCase() : '';
    let roleAttr = '';
    if (r === 'admin') roleAttr = 'admin';
    else if (r === 'fleet_manager' || r === 'manager') roleAttr = 'manager';
    else if (r === 'driver') roleAttr = 'driver';
    else if (r === 'customer') roleAttr = 'customer';

    if (roleAttr) {
      document.documentElement.setAttribute('data-role', roleAttr);
    } else {
      document.documentElement.removeAttribute('data-role');
    }
  }, [user?.role]);

  // Show a short full-screen loader while verifying an existing session
  if (loading && hasStoredSession()) {
    return <PageLoader message="Verifying session..." />;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        isAuthenticated: !!user,
        loading,
        login,
        logout,
        updateUser,
        getHomePath: () => getHomePath(user?.role),
        resetInactivityTimer,
      }}
    >
      {children}

      {/* Inactivity Warning Dialog: Shown 60 seconds before auto-logout */}
      {inactivityWarning && (
        <ConfirmDialog
          isOpen={true}
          title="Session Inactivity Warning"
          message={`You will be logged out in ${secondsLeft} seconds due to inactivity. Would you like to stay signed in?`}
          confirmText="Stay logged in"
          cancelText="Log out now"
          confirmVariant="primary"
          onConfirm={resetInactivityTimer}
          onClose={() => logout({ message: 'You have logged out.' })}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
