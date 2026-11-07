import React from 'react';
import Button from './Button';
import IconButton from './IconButton';
import { CheckCircleIcon, AlertCircleIcon, InfoIcon, CloseIcon } from './Icons';
import './Toast.css';

export default function Toast({ toasts = [], onClose }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-item toast-${toast.type}`}>
          <div className="toast-icon">
            {toast.type === 'success' && <CheckCircleIcon size={18} />}
            {toast.type === 'error' && <AlertCircleIcon size={18} />}
            {toast.type === 'warning' && <AlertCircleIcon size={18} />}
            {toast.type === 'info' && <InfoIcon size={18} />}
          </div>
          <div className="toast-message">{toast.message}</div>
          {toast.action && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="toast-action-btn"
              onClick={() => {
                if (typeof toast.action.onClick === 'function') {
                  toast.action.onClick();
                }
                onClose(toast.id);
              }}
              style={{
                marginLeft: '8px',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                whiteSpace: 'nowrap',
              }}
            >
              {toast.action.label || 'Action'}
            </Button>
          )}
          <IconButton
            icon={<CloseIcon size={14} />}
            onClick={() => onClose(toast.id)}
            ariaLabel="Dismiss toast"
            label=""
            title="Dismiss"
            variant="ghost"
            shape="round"
            size="sm"
            className="toast-close"
          />
          <div
            className="toast-progress-bar"
            style={{
              animationDuration: `${
                toast.duration ||
                (toast.type === 'error' ? 6000 : toast.type === 'success' ? 3000 : 5000)
              }ms`,
            }}
          />
        </div>
      ))}
    </div>
  );
}
