/* eslint-disable no-restricted-syntax */
import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Modal from '../components/common/Modal';

describe('Modal Focus Integrity Tests (Item 1)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('focuses the first form field when opened, not the close button', () => {
    render(
      <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
        <form>
          <input data-testid="field-1" name="field1" placeholder="First field" />
          <input data-testid="field-2" name="field2" placeholder="Second field" />
        </form>
      </Modal>
    );

    // Fast-forward 50ms initial focus timer
    act(() => {
      jest.advanceTimersByTime(60);
    });

    const field1 = screen.getByTestId('field-1');
    const closeBtn = screen.getByLabelText('Close dialog');

    expect(document.activeElement).toBe(field1);
    expect(document.activeElement).not.toBe(closeBtn);
  });

  test('re-rendering with new props or state does NOT move focus away from active field', () => {
    function ControlledModalWrapper() {
      const [val, setVal] = useState('');
      const [, setCounter] = useState(0);

      return (
        <div>
          <button data-testid="trigger-rerender" onClick={() => setCounter((c) => c + 1)}>
            Re-render Parent
          </button>
          <Modal
            isOpen={true}
            // Passing a fresh inline arrow function on every render simulates common parent behavior
            onClose={() => {}}
            title="Controlled Modal"
          >
            <form>
              <input
                data-testid="first-input"
                value={val}
                onChange={(e) => setVal(e.target.value)}
              />
              <input data-testid="second-input" />
            </form>
          </Modal>
        </div>
      );
    }

    render(<ControlledModalWrapper />);

    act(() => {
      jest.advanceTimersByTime(60);
    });

    // Manually focus the second input
    const secondInput = screen.getByTestId('second-input');
    secondInput.focus();
    expect(document.activeElement).toBe(secondInput);

    // Trigger parent re-renders (simulates typing or parent updates)
    const rerenderBtn = screen.getByTestId('trigger-rerender');
    fireEvent.click(rerenderBtn);

    // Advance any timers
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // Focus must stay on secondInput! It must NOT jump to the close button or first input
    expect(document.activeElement).toBe(secondInput);

    // Type into first input
    const firstInput = screen.getByTestId('first-input');
    firstInput.focus();
    fireEvent.change(firstInput, { target: { value: 'Typing text...' } });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(document.activeElement).toBe(firstInput);
  });

  test('restores focus to previously active element on close', () => {
    function Host() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <div>
          <button data-testid="open-btn" onClick={() => setIsOpen(true)}>
            Open
          </button>
          <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Close Test">
            <input data-testid="inner-input" />
          </Modal>
        </div>
      );
    }

    render(<Host />);
    const openBtn = screen.getByTestId('open-btn');
    openBtn.focus();
    expect(document.activeElement).toBe(openBtn);

    fireEvent.click(openBtn);

    act(() => {
      jest.advanceTimersByTime(60);
    });

    const innerInput = screen.getByTestId('inner-input');
    expect(document.activeElement).toBe(innerInput);

    // Click close button
    const closeBtn = screen.getByLabelText('Close dialog');
    fireEvent.click(closeBtn);

    expect(document.activeElement).toBe(openBtn);
  });
});

