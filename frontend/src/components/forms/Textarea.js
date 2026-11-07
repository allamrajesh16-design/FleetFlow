import React, { forwardRef } from 'react';
import FormField from './FormField';
import './forms.css';

const Textarea = forwardRef(function Textarea(
  {
    label,
    id,
    name,
    value,
    defaultValue,
    onChange,
    placeholder,
    rows = 3,
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
  const areaId = id || name;

  const control = (
    <div className="ff-control-wrapper">
      <textarea
        ref={ref}
        id={areaId}
        name={name}
        rows={rows}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        className={`ff-control ff-textarea ${error ? 'ff-error' : ''} ${className}`}
        {...props}
      />
    </div>
  );

  if (label || error || hint || helperText) {
    return (
      <FormField
        label={label}
        id={areaId}
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

export default Textarea;
