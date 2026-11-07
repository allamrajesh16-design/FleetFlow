import React from 'react';
import Button from './Button';
import ButtonGroup from './ButtonGroup';
import './ViewSwitch.css';

/**
 * ViewSwitch component for Desktop Table | Cards switching
 * Automatically syncs with localStorage if storageKey is provided
 */
export default function ViewSwitch({
  view = 'table',
  onChange,
  storageKey = '',
  className = '',
}) {
  const currentView = view || 'table';

  const handleSelect = (mode) => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, mode);
      } catch (e) {
        // Ignore storage errors
      }
    }
    if (onChange) {
      onChange(mode);
    }
  };

  return (
    <div className={`view-switch-container ${className}`}>
      <ButtonGroup>
        <Button
          type="button"
          size="small"
          variant={currentView === 'table' ? 'primary' : 'outline'}
          onClick={() => handleSelect('table')}
          aria-label="Table View"
        >
          Table
        </Button>
        <Button
          type="button"
          size="small"
          variant={currentView === 'cards' ? 'primary' : 'outline'}
          onClick={() => handleSelect('cards')}
          aria-label="Cards View"
        >
          Cards
        </Button>
      </ButtonGroup>
    </div>
  );
}
