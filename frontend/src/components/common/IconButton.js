import React from 'react';
import {
  EyeIcon,
  EditIcon,
  DeleteIcon,
  CheckIcon,
  CloseIcon,
  DownloadIcon,
} from './Icons';
import './IconButton.css';

/**
 * IconButton Component
 * Built for table actions (view, edit, delete, approve, reject, download) and compact controls.
 * - round or square shape
 * - aria-label & tooltip (title)
 * - On screens < 768px: automatically reveals the text label alongside the icon.
 */
export default function IconButton({
  action,              // 'view' | 'edit' | 'delete' | 'approve' | 'reject' | 'download'
  icon,                // Custom icon if action is not one of above
  label,               // Custom text label / tooltip
  title,               // Tooltip override
  ariaLabel,           // Accessibility label override
  variant,             // 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline'
  shape = 'round',     // 'round' | 'square'
  size = 'md',         // 'sm' | 'md' | 'lg'
  disabled = false,
  loading = false,
  onClick,
  className = '',
  ...props
}) {
  // Action configurations
  const actionConfigs = {
    view: {
      defaultLabel: 'View',
      defaultVariant: 'secondary',
      IconComponent: EyeIcon,
    },
    edit: {
      defaultLabel: 'Edit',
      defaultVariant: 'secondary',
      IconComponent: EditIcon,
    },
    delete: {
      defaultLabel: 'Delete',
      defaultVariant: 'danger',
      IconComponent: DeleteIcon,
    },
    approve: {
      defaultLabel: 'Approve',
      defaultVariant: 'success',
      IconComponent: CheckIcon,
    },
    reject: {
      defaultLabel: 'Reject',
      defaultVariant: 'danger',
      IconComponent: CloseIcon,
    },
    download: {
      defaultLabel: 'Download',
      defaultVariant: 'secondary',
      IconComponent: DownloadIcon,
    },
  };

  const config = action ? actionConfigs[action] : null;
  const resolvedLabel = label || (config ? config.defaultLabel : '');
  const resolvedTitle = title || label || (config ? config.defaultLabel : ariaLabel || '');
  const resolvedAriaLabel = ariaLabel || title || label || (config ? config.defaultLabel : 'Button');
  const resolvedVariant = variant || (config ? config.defaultVariant : 'secondary');

  const normalizedSize = size === 'small' ? 'sm' : size === 'large' ? 'lg' : size === 'medium' ? 'md' : (size || 'md');
  const iconSize = normalizedSize === 'sm' ? 15 : normalizedSize === 'lg' ? 20 : 17;

  let renderedIcon = icon || props.children;
  if (!renderedIcon && config) {
    const Component = config.IconComponent;
    renderedIcon = <Component size={iconSize} />;
  }

  const classes = [
    'icon-btn',
    `icon-btn-${shape}`,
    `icon-btn-${normalizedSize}`,
    `icon-btn-${resolvedVariant}`,
    loading ? 'icon-btn-loading' : '',
    className,
  ].filter(Boolean).join(' ');

  // Remove all custom props before spreading onto DOM button
  const domProps = { ...props };
  delete domProps.children;
  delete domProps.action;
  delete domProps.icon;
  delete domProps.leftIcon;
  delete domProps.rightIcon;
  delete domProps.iconLeft;
  delete domProps.iconRight;
  delete domProps.label;
  delete domProps.ariaLabel;
  delete domProps.variant;
  delete domProps.shape;
  delete domProps.size;
  delete domProps.loading;
  delete domProps.fullWidth;

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled || loading}
      title={resolvedTitle}
      aria-label={resolvedAriaLabel}
      {...domProps}
    >
      <span className="icon-btn-icon" aria-hidden="true">
        {loading ? <span className="icon-btn-spinner" /> : renderedIcon}
      </span>
      {resolvedLabel ? <span className="icon-btn-label">{resolvedLabel}</span> : null}
    </button>
  );
}
