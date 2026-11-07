import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import IconButton from './IconButton';
import { CloseIcon } from './Icons';
import './Modal.css';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = '640px',
  size,
}) {
  const modalRef = useRef(null);
  const previouslyFocusedElement = useRef(null);
  const mouseDownTargetIsOverlay = useRef(false);

  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElement.current = document.activeElement;
      document.body.style.overflow = 'hidden';

      // Focus first focusable element inside modal
      const timer = setTimeout(() => {
        if (modalRef.current) {
          const focusable = modalRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length > 0) {
            focusable[0].focus();
          }
        }
      }, 50);

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose?.();
          return;
        }

        // Trap focus inside modal
        if (e.key === 'Tab' && modalRef.current) {
          const focusable = Array.from(
            modalRef.current.querySelectorAll(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          );

          if (focusable.length === 0) return;

          const firstElement = focusable[0];
          const lastElement = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = 'unset';
        window.removeEventListener('keydown', handleKeyDown);
        if (previouslyFocusedElement.current && previouslyFocusedElement.current.focus) {
          previouslyFocusedElement.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayMouseDown = (e) => {
    mouseDownTargetIsOverlay.current = e.target === e.currentTarget;
  };

  const handleOverlayMouseUp = (e) => {
    if (mouseDownTargetIsOverlay.current && e.target === e.currentTarget) {
      onClose?.();
    }
    mouseDownTargetIsOverlay.current = false;
  };

  const effectiveMaxWidth = size === 'large' ? '720px' : size === 'small' ? '460px' : maxWidth || '640px';

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={handleOverlayMouseDown}
      onMouseUp={handleOverlayMouseUp}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="modal-container"
        style={{ maxWidth: effectiveMaxWidth }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        <div className="modal-header">
          {title && (
            <h3 id="modal-title" className="modal-title">
              {title}
            </h3>
          )}
          <IconButton
            icon={<CloseIcon size={20} />}
            onClick={onClose}
            ariaLabel="Close dialog"
            title="Close"
            variant="ghost"
            shape="round"
            className="modal-close-btn"
          />
        </div>

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
