import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ForgotPasswordPage, { maskEmail } from '../pages/public/ForgotPasswordPage';
import { checkPasswordCriteria } from '../components/forms/PasswordStrengthMeter';
import { ToastProvider } from '../context/ToastContext';
import { AuthProvider } from '../context/AuthContext';
import * as authApi from '../api/auth';

jest.mock('../api/auth', () => ({
  forgotPasswordApi: jest.fn(),
  verifyResetOtpApi: jest.fn(),
  resetPasswordOtpApi: jest.fn(),
  loginApi: jest.fn(),
  getProfileApi: jest.fn(),
}));

describe('ForgotPasswordFlow Frontend Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  test('maskEmail properly masks email addresses', () => {
    expect(maskEmail('alexander@gmail.com')).toBe('a***@gmail.com');
    expect(maskEmail('b@domain.com')).toBe('b***@domain.com');
    expect(maskEmail('invalid-email')).toBe('invalid-email');
  });

  test('checkPasswordCriteria calculates score and checks all rules', () => {
    const weak = checkPasswordCriteria('123');
    expect(weak.score).toBe(1);
    expect(weak.isValid).toBe(false);

    const full = checkPasswordCriteria('ValidPass123!');
    expect(full.score).toBe(4);
    expect(full.isValid).toBe(true);
    expect(full.criteria.every((c) => c.valid)).toBe(true);
  });

  test('renders step 1 (Email) initially and does not store email or token in localStorage or URL', async () => {
    render(
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <ForgotPasswordPage />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    );

    expect(screen.getByText(/Reset Your Password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Registered Email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send code/i })).toBeInTheDocument();

    // Verify localStorage has no email or token
    expect(localStorage.getItem('email')).toBeNull();
    expect(localStorage.getItem('reset_token')).toBeNull();
    expect(sessionStorage.getItem('email')).toBeNull();
    expect(sessionStorage.getItem('reset_token')).toBeNull();
  });

  test('submitting email transitions to step 2 (Code)', async () => {
    authApi.forgotPasswordApi.mockResolvedValueOnce({
      message: 'If this email is registered, a code has been sent.',
      seconds_left: 60,
    });

    render(
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <ForgotPasswordPage />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    );

    const emailInput = screen.getByLabelText(/Registered Email/i);
    fireEvent.change(emailInput, { target: { value: 'tester@example.com' } });

    const submitBtn = screen.getByRole('button', { name: /Send code/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Enter Verification Code/i)).toBeInTheDocument();
      expect(screen.getByText(/t\*\*\*@example\.com/i)).toBeInTheDocument();
      expect(screen.getByText(/Resend code in/i)).toBeInTheDocument();
    });

    // Check no tokens stored in storage
    expect(localStorage.getItem('reset_token')).toBeNull();
    expect(sessionStorage.getItem('reset_token')).toBeNull();
  });

  test('step 2 OTP inputs accept 6 digits and verify code', async () => {
    authApi.forgotPasswordApi.mockResolvedValueOnce({
      message: 'If this email is registered, a code has been sent.',
      seconds_left: 60,
    });
    authApi.verifyResetOtpApi.mockResolvedValueOnce({
      message: 'Code verified successfully.',
      reset_token: 'secret_single_use_session_token_123',
    });

    render(
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <ForgotPasswordPage />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    );

    // Step 1
    fireEvent.change(screen.getByLabelText(/Registered Email/i), {
      target: { value: 'tester@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send code/i }));

    // Wait for Step 2
    await waitFor(() => {
      expect(screen.getByText(/Enter Verification Code/i)).toBeInTheDocument();
    });

    // Enter 6 digits
    const boxes = screen.getAllByLabelText(/Digit \d/i);
    expect(boxes).toHaveLength(6);

    ['1', '2', '3', '4', '5', '6'].forEach((d, i) => {
      fireEvent.change(boxes[i], { target: { value: d } });
    });

    const verifyBtn = screen.getByRole('button', { name: /Verify code/i });
    expect(verifyBtn).not.toBeDisabled();
    fireEvent.click(verifyBtn);

    // Transitions to Step 3
    await waitFor(() => {
      expect(screen.getByText(/Create New Password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^New Password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Confirm New Password/i)).toBeInTheDocument();
    });
  });

  test('shows attempts left and error message when wrong OTP is entered', async () => {
    authApi.forgotPasswordApi.mockResolvedValueOnce({
      message: 'If this email is registered, a code has been sent.',
      seconds_left: 60,
    });
    authApi.verifyResetOtpApi.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          detail: 'Invalid or expired code.',
          attempts_left: 3,
        },
      },
    });

    render(
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <ForgotPasswordPage />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText(/Registered Email/i), {
      target: { value: 'tester@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send code/i }));

    await waitFor(() => {
      expect(screen.getByText(/Enter Verification Code/i)).toBeInTheDocument();
    });

    const boxes = screen.getAllByLabelText(/Digit \d/i);
    ['9', '9', '9', '9', '9', '9'].forEach((d, i) => {
      fireEvent.change(boxes[i], { target: { value: d } });
    });

    const verifyBtn = screen.getByRole('button', { name: /Verify code/i });
    expect(verifyBtn).not.toBeDisabled();
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByText(/3 attempts remaining/i)).toBeInTheDocument();
    });
  });
});

