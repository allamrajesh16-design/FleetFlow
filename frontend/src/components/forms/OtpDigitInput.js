import React, { forwardRef } from 'react';

const OtpDigitInput = forwardRef(function OtpDigitInput(
  {
    value,
    onChange,
    onKeyDown,
    className = '',
    'aria-label': ariaLabel,
    ...props
  },
  ref
) {
  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={1}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      className={className}
      aria-label={ariaLabel}
      {...props}
    />
  );
});

export default OtpDigitInput;
