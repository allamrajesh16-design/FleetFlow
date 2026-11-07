import React, { forwardRef } from 'react';
import FormField from './FormField';
import './forms.css';

/**
 * Extracts and cleans digits from raw input text.
 * Strips non-digits and leading +91, 91 or 0 prefix if present.
 * Limits to 10 digits.
 */
export function cleanPhoneInput(raw) {
  if (raw === null || raw === undefined) return '';
  let str = String(raw).trim();
  // Strip non-digit characters
  let digits = str.replace(/\D/g, '');
  // If starts with 91 and has 12 digits, strip 91
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

/**
 * Validates Indian 10-digit mobile number:
 * - Exactly 10 digits
 * - Starts with 6, 7, 8 or 9
 * - Rejects repeated digits (e.g. 9999999999, 0000000000)
 */
export function isValidIndianPhone(phone) {
  const digits = cleanPhoneInput(phone);
  if (digits.length !== 10) return false;
  if (!['6', '7', '8', '9'].includes(digits[0])) return false;
  if (new Set(digits).size === 1) return false;
  return true;
}

export const PHONE_ERROR_MESSAGE = 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9';

const PhoneInput = forwardRef(function PhoneInput(
  {
    label,
    id,
    name = 'phone',
    value = '',
    onChange,
    placeholder = '98765 43210',
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
  const digits = cleanPhoneInput(value);
  const isValid = isValidIndianPhone(digits);

  const handleInputChange = (e) => {
    const rawVal = e.target.value;
    const cleaned = cleanPhoneInput(rawVal);
    if (onChange) {
      onChange({
        ...e,
        target: {
          ...e.target,
          name,
          value: cleaned,
        },
      });
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData ? e.clipboardData.getData('text') : '';
    const cleaned = cleanPhoneInput(pastedText);
    if (onChange) {
      onChange({
        target: {
          name,
          value: cleaned,
        },
      });
    }
  };

  return (
    <FormField
      label={label}
      id={inputId}
      required={required}
      error={error}
      hint={hint}
      helperText={helperText}
      style={style}
      className={className}
    >
      <div className={`ff-control-wrapper ff-phone-wrapper ${error ? 'ff-error' : ''}`}>
        <span className="ff-phone-prefix" aria-label="Country Code India">
          +91
        </span>
        <input
          ref={ref}
          id={inputId}
          name={name}
          type="tel"
          inputMode="tel"
          value={digits}
          onChange={handleInputChange}
          onPaste={handlePaste}
          placeholder={placeholder}
          maxLength={10}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          className="ff-control ff-phone-input"
          {...props}
        />
        <div className="ff-phone-status" aria-live="polite">
          {isValid ? (
            <span className="ff-phone-tick" title="Valid mobile number">
              ✓
            </span>
          ) : (
            <span className="ff-phone-counter">{digits.length}/10</span>
          )}
        </div>
      </div>
    </FormField>
  );
});

export default PhoneInput;
