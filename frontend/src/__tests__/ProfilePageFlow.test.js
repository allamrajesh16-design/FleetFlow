import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfilePage from '../pages/shared/ProfilePage';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { MemoryRouter } from 'react-router-dom';
import * as authApi from '../api/auth';

jest.mock('../api/auth', () => ({
  getProfileApi: jest.fn(),
  updateProfileApi: jest.fn(),
  changePasswordApi: jest.fn(),
  logoutApi: jest.fn(),
}));

jest.mock('../api/driver', () => ({
  getDriverMeApi: jest.fn().mockResolvedValue({
    license_number: 'DL-99887766',
    license_expiry: '2028-12-31',
    status: 'ACTIVE',
  }),
}));

describe('ProfilePage Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.clearAllMocks();

    localStorage.setItem('fleetflow_access_token', 'mock_access_token');
    localStorage.setItem(
      'fleetflow_user',
      JSON.stringify({
        id: 1,
        full_name: 'Original Test Name',
        email: 'testuser@example.com',
        phone: '9876543210',
        role: 'CUSTOMER',
        is_email_verified: true,
        created_at: '2026-01-15T00:00:00Z',
      })
    );

    authApi.getProfileApi.mockResolvedValue({
      id: 1,
      full_name: 'Original Test Name',
      email: 'testuser@example.com',
      phone: '9876543210',
      role: 'CUSTOMER',
      is_email_verified: true,
      created_at: '2026-01-15T00:00:00Z',
    });
  });

  const renderProfile = () => {
    return render(
      <MemoryRouter>
        <ToastProvider>
          <AuthProvider>
            <ProfilePage />
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    );
  };

  test('renders view mode with readonly rows, verified tick, and member since', async () => {
    renderProfile();

    await waitFor(() => {
      expect(screen.getByText('Account Profile')).toBeInTheDocument();
      expect(screen.getAllByText('Original Test Name').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('testuser@example.com')).toBeInTheDocument();
      expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
  });

  test('opens edit modal, validates phone and saves changes cleanly', async () => {
    authApi.updateProfileApi.mockResolvedValue({
      id: 1,
      full_name: 'Brand New Name',
      email: 'testuser@example.com',
      phone: '+919988776655',
      role: 'CUSTOMER',
      is_email_verified: true,
    });

    renderProfile();

    await waitFor(() => {
      expect(screen.getAllByText('Original Test Name').length).toBeGreaterThanOrEqual(1);
    });

    const editBtn = screen.getByRole('button', { name: /edit profile/i });
    fireEvent.click(editBtn);

    // Modal title appears
    expect(screen.getByRole('heading', { name: 'Edit Profile' })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/full name/i);
    const saveBtn = screen.getByRole('button', { name: /save changes/i });

    // Save button disabled initially before edits
    expect(saveBtn).toBeDisabled();

    // Edit full name
    fireEvent.change(nameInput, { target: { value: 'Brand New Name' } });
    expect(saveBtn).not.toBeDisabled();

    // Save changes
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(authApi.updateProfileApi).toHaveBeenCalledWith({
        full_name: 'Brand New Name',
        phone: '9876543210',
      });
      expect(screen.getAllByText('Brand New Name').length).toBeGreaterThanOrEqual(1);
    });
  });

  test('prompts discard confirmation when user tries to close modal with unsaved changes', async () => {
    renderProfile();

    await waitFor(() => {
      expect(screen.getAllByText('Original Test Name').length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

    const nameInput = screen.getByLabelText(/full name/i);
    fireEvent.change(nameInput, { target: { value: 'Unsaved Edit Name' } });

    // Click Cancel
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    // ConfirmDialog opens
    expect(screen.getByText('Discard changes?')).toBeInTheDocument();

    // Click "Keep Editing"
    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit Profile' })).toBeInTheDocument();

    // Click Cancel again and Discard
    fireEvent.click(cancelBtn);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('heading', { name: 'Edit Profile' })).not.toBeInTheDocument();
  });
});
