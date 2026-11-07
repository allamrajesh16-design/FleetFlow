import React from 'react';
import './PageHeader.css';

export default function PageHeader({
  title,
  subtitle,
  actions,
  action,
  breadcrumbs,
  className = '',
  children,
}) {
  const headerActions = actions || action || children;

  return (
    <div className={`page-header ${className}`}>
      <div className="page-header-content">
        {breadcrumbs && <div className="page-header-breadcrumbs">{breadcrumbs}</div>}
        <h1 className="page-header-title">{title}</h1>
        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
      </div>

      {headerActions && <div className="page-header-actions">{headerActions}</div>}
    </div>
  );
}
