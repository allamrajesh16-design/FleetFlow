import React, { forwardRef } from 'react';
import './forms.css';

const Checkbox = forwardRef(function Checkbox(
  {
    label,
    id,
    name,
    checked,
    defaultChecked,
    onChange,
    disabled = false,
    required = false,
    error,
    hint,
    className = '',
    style,
    ...props
  },
  ref
) {
  const checkboxId = id || name;

  return (
    <div className={`ff-form-field ${error ? 'ff-has-error' : ''} ${className}`} style={style}>
      <label
        htmlFor={checkboxId}
        className={`ff-choice-label ${disabled ? 'ff-disabled' : ''}`}
      >
        <input
          ref={ref}
          id={checkboxId}
          name={name}
          type="checkbox"
          checked={checked}
          defaultChecked={defaultChecked}
          onChange={onChange}
          disabled={disabled}
          required={required}
          className="ff-checkbox"
          {...props}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <span className="ff-field-error" role="alert">
          {Array.isArray(error) ? error[0] : error}
        </span>
      ) : hint ? (
        <span className="ff-field-hint">{hint}</span>
      ) : null}
    </div>
  );
});

export default Checkbox;
