import React, { forwardRef } from 'react';
import FormField from './FormField';
import './forms.css';

const DateInput = forwardRef(function DateInput(
  {
    label,
    id,
    name,
    value,
    defaultValue,
    onChange,
    placeholder,
    error,
    hint = 'Format: YYYY-MM-DD',
    helperText,
    required = false,
    disabled = false,
    readOnly = false,
    className = '',
    style,
    min,
    max,
    ...props
  },
  ref
) {
  const inputId = id || name;

  const control = (
    <div className="ff-control-wrapper">
      <input
        ref={ref}
        id={inputId}
        name={name}
        type="date"
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        className={`ff-control ff-date-input ${error ? 'ff-error' : ''} ${className}`}
        {...props}
      />
    </div>
  );

  if (label || error || hint || helperText) {
    return (
      <FormField
        label={label}
        id={inputId}
        required={required}
        hint={hint}
        helperText={helperText}
        error={error}
        style={style}
      >
        {control}
      </FormField>
    );
  }

  return control;
});

export default DateInput;
