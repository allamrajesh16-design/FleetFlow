import React from 'react';
import Modal from './Modal';
import Button from './Button';
import { Textarea } from '../forms';
import './ConfirmDialog.css';

/**
 * ConfirmDialog component for destructive or sensitive operations
 * Supports optional text input for actions that require a reason (e.g. Reject reason).
 */
export default function ConfirmDialog({
  isOpen,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Confirm',
  confirmLabel = null,
  cancelText = 'Cancel',
  cancelLabel = null,
  confirmVariant = 'danger',
  variant = null,
  isDanger = false,
  loading = false,
  onConfirm,
  onClose,
  onCancel,
  // Optional reason input
  inputLabel = null,
  inputValue = '',
  onInputChange = null,
  inputPlaceholder = 'Please enter a reason...',
  inputRequired = false,
}) {
  const finalConfirmText = confirmLabel || confirmText;
  const finalCancelText = cancelLabel || cancelText;
  const finalVariant = isDanger ? 'danger' : variant || confirmVariant;
  const handleClose = onCancel || onClose;

  const isConfirmDisabled = loading || (inputRequired && !inputValue?.trim());

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isConfirmDisabled) {
      onConfirm();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? undefined : handleClose}
      title={title}
      size="small"
      footer={
        <div className="confirm-dialog-actions">
          <Button
            type="button"
            variant="outline"
            size="medium"
            onClick={handleClose}
            disabled={loading}
          >
            {finalCancelText}
          </Button>
          <Button
            type="button"
            variant={finalVariant}
            size="medium"
            loading={loading}
            disabled={isConfirmDisabled}
            onClick={handleSubmit}
          >
            {finalConfirmText}
          </Button>
        </div>
      }
    >
      <div className="confirm-dialog-content">
        <p className="confirm-dialog-message">{message}</p>

        {inputLabel && (
          <Textarea
            label={inputLabel}
            required={inputRequired}
            placeholder={inputPlaceholder}
            value={inputValue}
            onChange={(e) => onInputChange && onInputChange(e.target.value)}
            rows={3}
            autoFocus
            disabled={loading}
          />
        )}
      </div>
    </Modal>
  );
}
