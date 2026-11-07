import React from 'react';
import Modal from './Modal';
import Button from './Button';
import './FormModal.css';

/**
 * FormModal component for Add and Edit modal forms
 */
export default function FormModal({
  isOpen,
  onClose,
  title,
  onSubmit,
  loading = false,
  submitting = false,
  submitText,
  submitLabel,
  cancelText = 'Cancel',
  size = 'medium',
  submitDisabled = false,
  children,
}) {
  const isLoading = loading || submitting;
  const resolvedSubmitText = submitLabel || submitText || 'Save Changes';

  return (
    <Modal
      isOpen={isOpen}
      onClose={isLoading ? undefined : onClose}
      title={title}
      size={size}
      footer={
        <div className="form-modal-actions">
          <Button
            type="button"
            variant="outline"
            size="medium"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="medium"
            loading={isLoading}
            disabled={isLoading || submitDisabled}
            onClick={onSubmit}
          >
            {resolvedSubmitText}
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(e);
        }}
        className="form-modal-body"
        noValidate
      >
        {children}
      </form>
    </Modal>
  );
}
