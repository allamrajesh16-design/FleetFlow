import React from 'react';
import './forms.css';

export default function FormField({
  label,
  id,
  htmlFor,
  required = false,
  hint,
  helperText,
  error,
  className = '',
  style,
  children,
}) {
  const targetId = htmlFor || id;
  const effectiveHint = hint || helperText;
  const cleanLabel = typeof label === 'string' ? label.replace(/\s*\*+\s*$/, '') : label;

  return (
    <div
      className={`ff-form-field ${error ? 'ff-has-error' : ''} ${className}`}
      style={style}
    >
      {cleanLabel && (
        <label htmlFor={targetId} className="ff-form-label">
          <span>{cleanLabel}</span>
          {required && <span className="ff-required-star" aria-hidden="true">*</span>}
        </label>
      )}

      {children}

      {error ? (
        <span id={targetId ? `${targetId}-error` : undefined} className="ff-field-error" role="alert">
          {Array.isArray(error) ? error[0] : error}
        </span>
      ) : effectiveHint ? (
        <span id={targetId ? `${targetId}-hint` : undefined} className="ff-field-hint">{effectiveHint}</span>
      ) : null}
    </div>
  );
}
