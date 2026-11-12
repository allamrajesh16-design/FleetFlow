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
  const onCloseRef = useRef(onClose);
  const hasFocusedRef = useRef(false);

  // Keep onClose ref updated without re-triggering effects
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElement.current = document.activeElement;

      // Fixed position body scroll lock: prevents background movement & wobble
      const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;

      const originalOverflow = document.body.style.overflow;
      const originalPosition = document.body.style.position;
      const originalTop = document.body.style.top;
      const originalLeft = document.body.style.left;
      const originalWidth = document.body.style.width;
      const originalHeight = document.body.style.height;
      const originalHtmlOverflow = document.documentElement.style.overflow;

      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = `-${scrollX}px`;
      document.body.style.width = '100%';
      document.body.style.height = '100%';

      // Move focus ONCE when modal opens: prefer first input/textarea/select, never close button
      let timer = null;
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        timer = setTimeout(() => {
          if (!modalRef.current) return;

          // 1. Look for first form input/textarea/select
          const formInputs = modalRef.current.querySelectorAll(
            'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
          );
          if (formInputs.length > 0) {
            formInputs[0].focus();
            return;
          }

          // 2. Fall back to first actionable button (excluding close button) or link
          const actionable = Array.from(
            modalRef.current.querySelectorAll(
              'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => !el.classList.contains('modal-close-btn') && !el.classList.contains('modal-close'));

          if (actionable.length > 0) {
            actionable[0].focus();
            return;
          }

          // 3. Fallback to close button only if no other focusable element exists
          const closeBtn = modalRef.current.querySelector('.modal-close-btn, .modal-close');
          if (closeBtn) {
            closeBtn.focus();
          }
        }, 50);
      }

      return () => {
        if (timer) clearTimeout(timer);
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.body.style.overflow = originalOverflow;
        document.body.style.position = originalPosition;
        document.body.style.top = originalTop;
        document.body.style.left = originalLeft;
        document.body.style.width = originalWidth;
        document.body.style.height = originalHeight;
        if (typeof window.scrollTo === 'function') {
          try {
            window.scrollTo(scrollX, scrollY);
          } catch (_) {}
        }
        if (previouslyFocusedElement.current && typeof previouslyFocusedElement.current.focus === 'function') {
          previouslyFocusedElement.current.focus();
        }
        hasFocusedRef.current = false;
      };
    } else {
      hasFocusedRef.current = false;
    }
  }, [isOpen]);

  // Keyboard navigation (Tab focus trap & Escape key)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }

      // Trap focus inside modal on Tab key
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
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayMouseDown = (e) => {
    mouseDownTargetIsOverlay.current = e.target === e.currentTarget;
  };

  const handleOverlayMouseUp = (e) => {
    if (mouseDownTargetIsOverlay.current && e.target === e.currentTarget) {
      onCloseRef.current?.();
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
            onClick={() => onCloseRef.current?.()}
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
