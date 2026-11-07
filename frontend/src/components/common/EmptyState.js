import React from 'react';
import Button from './Button';
import './EmptyState.css';

export default function EmptyState({
  type = 'default', // 'bus' | 'car' | 'bike' | 'route' | 'document' | 'default'
  title = 'No Data Found',
  description = 'Check back later for updates or try adjusting your filters.',
  actionText,
  onAction,
  action,
  children,
  className = '',
}) {
  const resolvedAction = action || children;

  const renderIllustration = () => {
    switch (type) {
      case 'bus':
        return (
          <svg width="84" height="84" viewBox="0 0 84 84" fill="none" className="empty-state-svg">
            <circle cx="42" cy="42" r="38" fill="var(--neutral-bg)" />
            <rect x="22" y="24" width="40" height="36" rx="8" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2.5" />
            <rect x="27" y="30" width="30" height="12" rx="3" fill="var(--primary-soft)" />
            <circle cx="32" cy="52" r="4" fill="var(--text-subtle)" />
            <circle cx="52" cy="52" r="4" fill="var(--text-subtle)" />
            <path d="M22 45H62" stroke="var(--border)" strokeWidth="2" />
            <rect x="36" y="20" width="12" height="4" rx="2" fill="var(--primary)" />
          </svg>
        );
      case 'car':
        return (
          <svg width="84" height="84" viewBox="0 0 84 84" fill="none" className="empty-state-svg">
            <circle cx="42" cy="42" r="38" fill="var(--neutral-bg)" />
            <path d="M24 48L28 34C29 31 32 29 35 29H49C52 29 55 31 56 34L60 48" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="2.5" />
            <rect x="20" y="44" width="44" height="16" rx="5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2.5" />
            <circle cx="30" cy="56" r="4" fill="var(--text-subtle)" />
            <circle cx="54" cy="56" r="4" fill="var(--text-subtle)" />
            <circle cx="26" cy="48" r="2" fill="var(--warning-text)" />
            <circle cx="58" cy="48" r="2" fill="var(--warning-text)" />
          </svg>
        );
      case 'bike':
        return (
          <svg width="84" height="84" viewBox="0 0 84 84" fill="none" className="empty-state-svg">
            <circle cx="42" cy="42" r="38" fill="var(--neutral-bg)" />
            <circle cx="29" cy="50" r="8" stroke="var(--primary)" strokeWidth="2.5" />
            <circle cx="55" cy="50" r="8" stroke="var(--primary)" strokeWidth="2.5" />
            <path d="M29 50L39 36H49L55 50M39 36L44 46" stroke="var(--text-subtle)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="41" cy="30" r="3" fill="var(--primary)" />
          </svg>
        );
      case 'route':
        return (
          <svg width="84" height="84" viewBox="0 0 84 84" fill="none" className="empty-state-svg">
            <circle cx="42" cy="42" r="38" fill="var(--neutral-bg)" />
            <path d="M26 56C26 44 38 48 42 38C46 28 58 32 58 24" stroke="var(--primary)" strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round" />
            <circle cx="26" cy="56" r="5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />
            <rect x="54" y="20" width="8" height="8" rx="1" fill="var(--primary)" transform="rotate(45 58 24)" />
          </svg>
        );
      case 'document':
        return (
          <svg width="84" height="84" viewBox="0 0 84 84" fill="none" className="empty-state-svg">
            <circle cx="42" cy="42" r="38" fill="var(--neutral-bg)" />
            <rect x="28" y="22" width="28" height="40" rx="4" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2.5" />
            <line x1="34" y1="32" x2="50" y2="32" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
            <line x1="34" y1="40" x2="50" y2="40" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
            <line x1="34" y1="48" x2="44" y2="48" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="48" cy="48" r="3" fill="var(--primary)" />
          </svg>
        );
      default:
        return (
          <svg width="84" height="84" viewBox="0 0 84 84" fill="none" className="empty-state-svg">
            <circle cx="42" cy="42" r="38" fill="var(--neutral-bg)" />
            <rect x="25" y="30" width="34" height="26" rx="4" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
            <path d="M25 38L42 48L59 38" stroke="var(--text-subtle)" strokeWidth="2" strokeLinecap="round" />
            <line x1="32" y1="30" x2="52" y2="30" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="42" cy="50" r="3" fill="var(--primary)" />
          </svg>
        );
    }
  };

  return (
    <div className={`empty-state-card ${className}`}>
      {renderIllustration()}
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc">{description}</p>

      {resolvedAction ? (
        <div className="empty-state-action" style={{ marginTop: '16px' }}>
          {resolvedAction}
        </div>
      ) : actionText && onAction ? (
        <Button variant="primary" size="sm" onClick={onAction} className="empty-state-btn">
          {actionText}
        </Button>
      ) : null}
    </div>
  );
}
