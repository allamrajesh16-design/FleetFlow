import React, { forwardRef } from 'react';
import './forms.css';

const Radio = forwardRef(function Radio(
  {
    label,
    id,
    name,
    value,
    checked,
    defaultChecked,
    onChange,
    disabled = false,
    className = '',
    style,
    ...props
  },
  ref
) {
  const radioId = id || `${name}-${value}`;

  return (
    <label
      htmlFor={radioId}
      className={`ff-choice-label ${disabled ? 'ff-disabled' : ''} ${className}`}
      style={style}
    >
      <input
        ref={ref}
        id={radioId}
        name={name}
        type="radio"
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        disabled={disabled}
        className="ff-radio"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
});

export default Radio;
