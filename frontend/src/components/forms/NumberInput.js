import React, { forwardRef } from 'react';
import FormField from './FormField';
import './forms.css';

const NumberInput = forwardRef(function NumberInput(
  {
    label,
    id,
    name,
    value,
    defaultValue,
    onChange,
    placeholder,
    min,
    max,
    step = 1,
    error,
    hint,
    helperText,
    required = false,
    disabled = false,
    readOnly = false,
    className = '',
    style,
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
        type="number"
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        className={`ff-control ff-number-input ${error ? 'ff-error' : ''} ${className}`}
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

export default NumberInput;
