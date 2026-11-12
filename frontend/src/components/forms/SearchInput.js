import React, { useState, useEffect, useRef, forwardRef, useId } from 'react';
import IconButton from '../common/IconButton';
import { CloseIcon } from '../common/Icons';
import './forms.css';

const SearchInput = forwardRef(function SearchInput(
  {
    id,
    name,
    value: controlledValue,
    defaultValue = '',
    onChange,
    onSearch,
    placeholder = 'Search...',
    onClear,
    className = '',
    style,
    disabled = false,
    loading = false,
    debounceMs = 400,
    'aria-label': ariaLabel = 'Search',
    ...props
  },
  ref
) {
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState(isControlled ? controlledValue : defaultValue);
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    if (isControlled) {
      setInternalValue(controlledValue ?? '');
    }
  }, [controlledValue, isControlled]);

  const autoId = useId();
  const searchId = id || name || `search-input-${autoId}`;

  const triggerSearch = (term) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (onSearch) {
      onSearch(term);
    }
  };

  const handleChange = (e) => {
    const newVal = e.target.value;
    if (!isControlled) {
      setInternalValue(newVal);
    }
    if (onChange) {
      onChange(e);
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (debounceMs > 0 && onSearch) {
      debounceTimerRef.current = setTimeout(() => {
        onSearch(newVal);
      }, debounceMs);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerSearch(isControlled ? controlledValue : internalValue);
    }
    if (props.onKeyDown) {
      props.onKeyDown(e);
    }
  };

  const handleClear = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (!isControlled) {
      setInternalValue('');
    }
    if (onClear) {
      onClear();
    }
    if (onChange) {
      onChange({ target: { value: '' } });
    }
    if (onSearch) {
      onSearch('');
    }
  };

  const rawVal = isControlled ? controlledValue : internalValue;
  const currentVal =
    typeof rawVal === 'string'
      ? rawVal
      : rawVal?.target?.value !== undefined
      ? rawVal.target.value
      : String(rawVal || '');

  return (
    <div
      className={`ff-control-wrapper ff-search-input-wrapper ${className}`}
      style={{ minHeight: '44px', height: '44px', ...style }}
    >
      <span className="ff-icon-left" aria-hidden="true">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: '18px', height: '18px', flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>

      <input
        ref={ref}
        id={searchId}
        name={name}
        type="search"
        value={currentVal || ''}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`ff-control ff-has-left-icon ${currentVal || loading ? 'ff-has-right-icon' : ''}`}
        style={{
          height: '44px',
          minHeight: '44px',
          fontSize: '15px',
          paddingLeft: '40px',
          paddingRight: currentVal || loading ? '42px' : '14px',
          ...props.style,
        }}
        {...props}
      />

      {loading ? (
        <span
          className="ff-search-loading"
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-primary, var(--primary))',
          }}
          aria-label="Loading search results"
        >
          <svg
            className="animate-spin"
            style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              style={{ opacity: 0.25 }}
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              style={{ opacity: 0.75 }}
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </span>
      ) : currentVal && !disabled ? (
        <IconButton
          icon={<CloseIcon size={14} />}
          onClick={handleClear}
          ariaLabel="Clear search"
          label=""
          title="Clear search"
          variant="ghost"
          shape="round"
          size="sm"
          className="ff-search-clear-btn"
        />
      ) : null}
    </div>
  );
});

export default SearchInput;
