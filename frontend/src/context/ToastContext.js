import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import Toast from '../components/common/Toast';

export const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const recentMessagesRef = useRef(new Map());
  const activeTimerRef = useRef(null);

  const removeToast = useCallback((id) => {
    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }
    setToasts([]);
    recentMessagesRef.current.clear();
  }, []);

  const addToast = useCallback((message, type = 'info', customDuration = null, action = null) => {
    if (!message) return;
    const text = String(message).trim();
    if (!text) return;

    // Define standard durations per requirement: success 3s, error 6s, info/warning 5s
    const defaultDuration =
      type === 'success'
        ? 3000
        : type === 'error'
        ? 6000
        : 5000;
    const duration = customDuration !== null && customDuration !== undefined ? customDuration : defaultDuration;

    const now = Date.now();
    const lastTimestamp = recentMessagesRef.current.get(text) || 0;

    // Drop duplicate messages within 2000ms
    if (now - lastTimestamp < 2000) {
      return;
    }
    recentMessagesRef.current.set(text, now);

    // Garbage collect timestamps older than 15 seconds
    for (const [msg, time] of recentMessagesRef.current.entries()) {
      if (now - time > 15000) {
        recentMessagesRef.current.delete(msg);
      }
    }

    const id = `${now}-${Math.random().toString(36).substring(2, 9)}`;

    // Ensure ONLY ONE toast message is displayed at a time
    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }

    setToasts([{ id, message: text, type, action, duration }]);

    if (duration > 0) {
      activeTimerRef.current = setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const success = useCallback((msg, duration, action) => addToast(msg, 'success', duration, action), [addToast]);
  const error = useCallback((msg, duration, action) => addToast(msg, 'error', duration, action), [addToast]);
  const warning = useCallback((msg, duration, action) => addToast(msg, 'warning', duration, action), [addToast]);
  const info = useCallback((msg, duration, action) => addToast(msg, 'info', duration, action), [addToast]);

  return (
    <ToastContext.Provider
      value={{
        addToast,
        removeToast,
        clearToasts,
        success,
        error,
        warning,
        info,
        showSuccess: success,
        showError: error,
        showWarning: warning,
        showInfo: info,
      }}
    >
      {children}
      <Toast toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
