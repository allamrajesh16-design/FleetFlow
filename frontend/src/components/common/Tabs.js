import React, { useRef, useState, useEffect } from 'react';
import Button from './Button';
import './Tabs.css';

export default function Tabs({
  tabs = [],
  activeTab,
  onChange,
  variant = 'line', // 'line' | 'pills'
  className = '',
}) {
  const containerRef = useRef(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ opacity: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const activeBtn = containerRef.current.querySelector('.tab-btn.active');
    if (activeBtn) {
      setIndicatorStyle({
        transform: `translateX(${activeBtn.offsetLeft}px)`,
        width: `${activeBtn.offsetWidth}px`,
        opacity: 1,
      });
    }
  }, [activeTab, tabs]);

  return (
    <div
      ref={containerRef}
      className={`tabs-container tabs-${variant} ${className}`}
      role="tablist"
      style={{ position: 'relative' }}
    >
      {tabs.map((tab) => {
        const id = typeof tab === 'object' ? tab.id : tab;
        const label = typeof tab === 'object' ? tab.label : tab;
        const icon = typeof tab === 'object' ? tab.icon : null;
        const isActive = activeTab === id;

        return (
          <Button
            key={id}
            type="button"
            variant="ghost"
            role="tab"
            aria-selected={isActive}
            className={`tab-btn ${isActive ? 'active' : ''}`}
            onClick={() => onChange(id)}
            leftIcon={icon}
          >
            {label}
          </Button>
        );
      })}
      {variant === 'line' && (
        <div className="tabs-sliding-underline" style={indicatorStyle} />
      )}
    </div>
  );
}
