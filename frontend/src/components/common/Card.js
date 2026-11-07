import React from 'react';
import './Card.css';

export default function Card({
  children,
  className = '',
  padding = 'normal', // 'none' | 'tight' | 'normal' | 'relaxed'
  hover = false,
  onClick,
  ...props
}) {
  const domProps = { ...props };
  delete domProps.padding;
  delete domProps.hover;

  return (
    <div
      className={`card card-p-${padding} ${hover ? 'card-hoverable' : ''} ${className}`}
      onClick={onClick}
      {...domProps}
    >
      {children}
    </div>
  );
}
