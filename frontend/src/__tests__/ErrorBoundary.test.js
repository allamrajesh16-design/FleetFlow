import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../components/common/ErrorBoundary';

// Suppress console.error during expected throw tests
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = jest.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});

function BuggyComponent({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error('Crash on purpose in test');
  }
  return <div>Component rendered safely</div>;
}

describe('ErrorBoundary', () => {
  test('renders children when there is no error', () => {
    render(
      <ErrorBoundary componentName="Test Page">
        <div>Safe content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  test('catches child crash and displays fallback card with FleetFlow logo and required buttons', () => {
    render(
      <ErrorBoundary componentName="this page">
        <BuggyComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    // Fallback title
    expect(screen.getByText('Something went wrong on this page')).toBeInTheDocument();

    // Required buttons
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();

    // Console error was logged with component name
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[ErrorBoundary] Component "this page" crashed:'),
      expect.any(Error),
      expect.anything()
    );
  });

  test('clicking "Try again" resets error state and re-attempts render', () => {
    function ResettableContainer() {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <ErrorBoundary componentName="this page" onReset={() => setShouldThrow(false)}>
          <BuggyComponent shouldThrow={shouldThrow} />
        </ErrorBoundary>
      );
    }

    render(<ResettableContainer />);
    expect(screen.getByText('Something went wrong on this page')).toBeInTheDocument();

    // Click Try Again
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    // Now should recover
    expect(screen.getByText('Component rendered safely')).toBeInTheDocument();
  });
});
