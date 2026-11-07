import React, { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import FormField from './FormField';
import Button from '../common/Button';
import { EyeIcon, EyeOffIcon } from '../common/Icons';
import './forms.css';

const PasswordInput = forwardRef(function PasswordInput(
  {
    label,
    id,
    name,
    type: _ignoredType,
    showPasswordToggle: _ignoredToggle,
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
    className = '',
    style,
    ...props
  },
  ref
) {
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => inputRef.current);

  const inputId = id || name;

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const input = inputRef.current;
    let start = 0;
    let end = 0;
    if (input) {
      start = input.selectionStart ?? 0;
      end = input.selectionEnd ?? 0;
    }

    setShowPassword((prev) => !prev);

    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        try {
          input.setSelectionRange(start, end);
        } catch (_) {}
      }
    });
  };

  const control = (
    <div className="ff-control-wrapper">
      {leftIcon && <span className="ff-icon-left">{leftIcon}</span>}
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        {...props}
        type={showPassword ? 'text' : 'password'}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        className={`ff-control ${leftIcon ? 'ff-has-left-icon' : ''} ff-has-right-icon ${
          error ? 'ff-error' : ''
        } ${className}`}
      />
      <Button
        type="button"
        variant="ghost"
        className="ff-password-toggle"
        onClick={handleToggle}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        aria-pressed={showPassword}
        title={showPassword ? 'Hide password' : 'Show password'}
        leftIcon={showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
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

export default PasswordInput;
