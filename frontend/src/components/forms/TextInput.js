import React, { forwardRef } from 'react';
import FormField from './FormField';
import './forms.css';

const TextInput = forwardRef(function TextInput(
  {
    label,
    id,
    name,
    type = 'text',
    value,
    defaultValue,
    onChange,
    placeholder,
    error,
    hint,
    helperText,
    required = false,
    disabled = false,
    readOnly = false,
    leftIcon = null,
    rightElement = null,
    className = '',
    style,
    ...props
  },
  ref
) {
  const inputId = id || name;

  const control = (
    <div className="ff-control-wrapper">
      {leftIcon && <span className="ff-icon-left">{leftIcon}</span>}
      <input
        ref={ref}
        id={inputId}
        name={name}
        type={type}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error && inputId ? `${inputId}-error` : undefined}
        className={`ff-control ${leftIcon ? 'ff-has-left-icon' : ''} ${
          rightElement ? 'ff-has-right-icon' : ''
        } ${error ? 'ff-error field-shake-error' : ''} ${className}`}
        {...props}
      />
      {rightElement && <span className="ff-icon-right">{rightElement}</span>}
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

export default TextInput;
