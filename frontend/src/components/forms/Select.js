import React, { forwardRef } from 'react';
import FormField from './FormField';
import './forms.css';

const Select = forwardRef(function Select(
  {
    label,
    id,
    name,
    value,
    defaultValue,
    onChange,
    options,
    placeholder = 'Select an option',
    error,
    hint,
    helperText,
    required = false,
    disabled = false,
    className = '',
    style,
    children,
    ...props
  },
  ref
) {
  const selectId = id || name;

  const hasEmptyOption = Array.isArray(options) && options.some(
    (opt) => (typeof opt === 'object' ? opt?.value : opt) === ''
  );
  const shouldRenderPlaceholder = placeholder && !hasEmptyOption;

  const control = (
    <div className="ff-control-wrapper">
      <select
        ref={ref}
        id={selectId}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        required={required}
        className={`ff-control ff-select ${error ? 'ff-error' : ''} ${className}`}
        {...props}
      >
        {shouldRenderPlaceholder && <option value="">{placeholder}</option>}
        {options
          ? options.map((opt) => {
              const val = typeof opt === 'object' ? opt.value : opt;
              const lbl = typeof opt === 'object' ? opt.label : opt;
              const dis = typeof opt === 'object' ? opt.disabled : false;
              return (
                <option key={val} value={val} disabled={dis}>
                  {lbl}
                </option>
              );
            })
          : children}
      </select>
    </div>
  );

  if (label || error || hint || helperText) {
    return (
      <FormField
        label={label}
        id={selectId}
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

export default Select;
