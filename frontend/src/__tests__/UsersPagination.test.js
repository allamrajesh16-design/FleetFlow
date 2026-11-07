import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AdminUsersPage from '../pages/admin/AdminUsersPage';
import AdminDriversPage from '../pages/admin/AdminDriversPage';
import { ToastProvider } from '../context/ToastContext';
import { AuthProvider } from '../context/AuthContext';
import useApiList from '../hooks/useApiList';

// Mock useApiList directly so we test pagination interactions in both components cleanly
jest.mock('../hooks/useApiList');

describe('Users & Drivers Pagination and List Verification', () => {
  const renderWithProviders = (component) => {
    return render(
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>{component}</AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('AdminUsersPage displays user list with pagination controls when multiple pages exist', async () => {
    const mockUsersPage1 = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      full_name: `User Number ${i + 1}`,
      email: `user${i + 1}@example.com`,
      phone: `+91980000000${i}`,
      role: i % 2 === 0 ? 'CUSTOMER' : 'DRIVER',
      is_active: true,
      approval_status: 'APPROVED',
      created_at: '2026-01-01T10:00:00Z',
    }));

    const mockSetPage = jest.fn();

    useApiList.mockImplementation(({ endpoint }) => {
      if (endpoint === '/users/') {
        return {
          data: mockUsersPage1,
          rows: mockUsersPage1,
          totalCount: 60,
          count: 60,
          totalPages: 6,
          page: 1,
          loading: false,
          error: null,
          search: '',
          filters: { role: '', is_active: '' },
          setPage: mockSetPage,
          setSearch: jest.fn(),
          setFilter: jest.fn(),
          refresh: jest.fn(),
        };
      }
      return { data: [], rows: [], count: 0, totalPages: 1, page: 1, loading: false };
    });

    renderWithProviders(<AdminUsersPage />);

    // Verify first page items rendered
    expect(screen.getAllByText('User Number 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('User Number 10').length).toBeGreaterThan(0);

    // Verify entry counter text showing total entries
    expect(screen.getByText(/Showing/i)).toBeInTheDocument();
    expect(screen.getAllByText('60').length).toBeGreaterThan(0);

    // Check pagination buttons (Previous, Next, page numbers)
    const nextBtn = screen.getByLabelText('Next page');
    expect(nextBtn).toBeInTheDocument();
    expect(nextBtn).not.toBeDisabled();

    // Click Next page button
    fireEvent.click(nextBtn);
    expect(mockSetPage).toHaveBeenCalledWith(2);

    // Click page number button '2'
    const page2Btn = screen.getByRole('button', { name: 'Page 2' });
    expect(page2Btn).toBeInTheDocument();
    fireEvent.click(page2Btn);
    expect(mockSetPage).toHaveBeenCalledWith(2);
  });

  test('AdminDriversPage displays driver list with pagination controls', async () => {
    const mockDrivers = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      user: {
        id: i + 100,
        full_name: `Driver Number ${i + 1}`,
        email: `driver${i + 1}@fleetflow.com`,
        phone: `+91981112220${i}`,
      },
      license_number: `DL-2024-00${i}`,
      license_expiry: '2028-12-31',
      status: 'AVAILABLE',
      rating: 4.8,
    }));

    const mockSetPage = jest.fn();

    useApiList.mockImplementation(({ endpoint }) => {
      if (endpoint === '/drivers/') {
        return {
          data: mockDrivers,
          rows: mockDrivers,
          totalCount: 25,
          count: 25,
          totalPages: 3,
          page: 1,
          loading: false,
          error: null,
          search: '',
          filters: { status: '' },
          setPage: mockSetPage,
          setSearch: jest.fn(),
          setFilter: jest.fn(),
          refresh: jest.fn(),
        };
      }
      return { data: [], rows: [], count: 0, totalPages: 1, page: 1, loading: false };
    });

    renderWithProviders(<AdminDriversPage />);

    expect(screen.getAllByText('Driver Number 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('25').length).toBeGreaterThan(0);

    const nextBtn = screen.getByLabelText('Next page');
    expect(nextBtn).toBeInTheDocument();
    expect(nextBtn).not.toBeDisabled();

    fireEvent.click(nextBtn);
    expect(mockSetPage).toHaveBeenCalledWith(2);
  });
});
