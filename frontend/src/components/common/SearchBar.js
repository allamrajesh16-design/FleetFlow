import React from 'react';
import { SearchInput } from '../forms';

export default function SearchBar({
  value,
  searchValue,
  onChange,
  onSearch,
  placeholder = 'Search...',
  className = '',
  id,
  loading = false,
  ...props
}) {
  const currentVal = value !== undefined ? value : searchValue;
  const handleSearchChange = (eOrVal) => {
    const val = typeof eOrVal === 'string' ? eOrVal : eOrVal?.target?.value ?? '';
    if (onChange) {
      onChange(val);
    }
  };

  return (
    <div className={`search-bar-wrapper ${className}`} style={{ width: '100%' }}>
      <SearchInput
        id={id}
        value={typeof currentVal === 'string' ? currentVal : currentVal?.target?.value ?? ''}
        onChange={handleSearchChange}
        onSearch={onSearch}
        placeholder={placeholder}
        loading={loading}
        {...props}
      />
    </div>
  );
}
