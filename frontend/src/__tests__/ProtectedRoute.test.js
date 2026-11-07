import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import ProtectedRoute from '../routes/ProtectedRoute';
import UnauthorizedPage from '../pages/shared/UnauthorizedPage';
import ErrorState from '../components/common/ErrorState';
import { useAuth } from '../context/AuthContext';
import { getStoredToken } from '../utils/authStorage';

// Mock authStorage and AuthContext
jest.mock('../utils/authStorage', () => ({
  getStoredToken: jest.fn(),
}));

jest.mock('../context/AuthContext', () => {
  const actual = jest.requireActual('../context/AuthContext');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

function LocationDisplay() {
  const location = useLocation();
  return (
    <div>
      <div data-testid="location-pathname">{location.pathname}</div>
      <div data-testid="location-state-from">{location.state?.from || ''}</div>
      <div data-testid="location-state-roles">
        {location.state?.allowedRoles?.join(',') || ''}
      </div>
    </div>
  );
}

function renderGuardedApp(initialPath, allowedRoles = null) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/unauthorized"
          element={
            <div>
              <div>Unauthorized Page</div>
              <LocationDisplay />
            </div>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute allowedRoles={allowedRoles || ['ADMIN']}>
              <div>Admin Dashboard Area</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/dashboard"
          element={
            <ProtectedRoute allowedRoles={allowedRoles || ['FLEET_MANAGER']}>
              <div>Fleet Manager Dashboard Area</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver/dashboard"
          element={
            <ProtectedRoute allowedRoles={allowedRoles || ['DRIVER']}>
              <div>Driver Dashboard Area</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer/dashboard"
          element={
            <ProtectedRoute allowedRoles={allowedRoles || ['CUSTOMER']}>
              <div>Customer Dashboard Area</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <div>Shared Profile Page</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute Role Permission Matrix Tests', () => {
  const originalWarn = console.warn;
  beforeEach(() => {
    console.warn = jest.fn();
    getStoredToken.mockReturnValue('mock-jwt-token');
  });

  afterEach(() => {
    console.warn = originalWarn;
    jest.clearAllMocks();
  });

  test('Unauthenticated user is redirected to /login with state', () => {
    getStoredToken.mockReturnValue(null);
    useAuth.mockReturnValue({
      user: null,
      role: null,
      isAuthenticated: false,
      loading: false,
      logout: jest.fn(),
    });

    renderGuardedApp('/manager/dashboard', ['FLEET_MANAGER']);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  describe('Role: ADMIN', () => {
    beforeEach(() => {
      useAuth.mockReturnValue({
        user: { role: 'ADMIN', email: 'admin@fleetflow.com' },
        role: 'ADMIN',
        isAuthenticated: true,
        loading: false,
        logout: jest.fn(),
      });
    });

    test('ADMIN accessing /admin/dashboard -> GRANTED', () => {
      renderGuardedApp('/admin/dashboard', ['ADMIN']);
      expect(screen.getByText('Admin Dashboard Area')).toBeInTheDocument();
    });

    test('ADMIN accessing /manager/dashboard -> DENIED (redirects to /unauthorized)', () => {
      renderGuardedApp('/manager/dashboard', ['FLEET_MANAGER']);
      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
      expect(screen.getByTestId('location-state-from')).toHaveTextContent('/manager/dashboard');
      expect(screen.getByTestId('location-state-roles')).toHaveTextContent('FLEET_MANAGER');
    });

    test('ADMIN accessing /driver/dashboard -> DENIED', () => {
      renderGuardedApp('/driver/dashboard', ['DRIVER']);
      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    });

    test('ADMIN accessing /customer/dashboard -> DENIED', () => {
      renderGuardedApp('/customer/dashboard', ['CUSTOMER']);
      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    });

    test('ADMIN accessing shared /profile -> GRANTED', () => {
      renderGuardedApp('/profile');
      expect(screen.getByText('Shared Profile Page')).toBeInTheDocument();
    });
  });

  describe('Role: FLEET_MANAGER', () => {
    beforeEach(() => {
      useAuth.mockReturnValue({
        user: { role: 'FLEET_MANAGER', email: 'manager@fleetflow.com' },
        role: 'FLEET_MANAGER',
        isAuthenticated: true,
        loading: false,
        logout: jest.fn(),
      });
    });

    test('FLEET_MANAGER accessing /admin/dashboard -> DENIED (redirects to /unauthorized)', () => {
      renderGuardedApp('/admin/dashboard', ['ADMIN']);
      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
      expect(screen.getByTestId('location-state-from')).toHaveTextContent('/admin/dashboard');
      expect(screen.getByTestId('location-state-roles')).toHaveTextContent('ADMIN');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[Authorization Guard] Access denied. User role: "FLEET_MANAGER"')
      );
    });

    test('FLEET_MANAGER accessing /manager/dashboard -> GRANTED', () => {
      renderGuardedApp('/manager/dashboard', ['FLEET_MANAGER']);
      expect(screen.getByText('Fleet Manager Dashboard Area')).toBeInTheDocument();
    });

    test('FLEET_MANAGER accessing /driver/dashboard -> DENIED', () => {
      renderGuardedApp('/driver/dashboard', ['DRIVER']);
      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    });

    test('FLEET_MANAGER accessing /customer/dashboard -> DENIED', () => {
      renderGuardedApp('/customer/dashboard', ['CUSTOMER']);
      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    });

    test('FLEET_MANAGER accessing shared /profile -> GRANTED', () => {
      renderGuardedApp('/profile');
      expect(screen.getByText('Shared Profile Page')).toBeInTheDocument();
    });
  });

  describe('Role: DRIVER', () => {
    beforeEach(() => {
      useAuth.mockReturnValue({
        user: { role: 'DRIVER', email: 'driver@fleetflow.com' },
        role: 'DRIVER',
        isAuthenticated: true,
        loading: false,
        logout: jest.fn(),
      });
    });

    test('DRIVER accessing /admin/dashboard -> DENIED', () => {
      renderGuardedApp('/admin/dashboard', ['ADMIN']);
      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    });

    test('DRIVER accessing /manager/dashboard -> DENIED', () => {
      renderGuardedApp('/manager/dashboard', ['FLEET_MANAGER']);
      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    });

    test('DRIVER accessing /driver/dashboard -> GRANTED', () => {
      renderGuardedApp('/driver/dashboard', ['DRIVER']);
      expect(screen.getByText('Driver Dashboard Area')).toBeInTheDocument();
    });

    test('DRIVER accessing /customer/dashboard -> DENIED', () => {
      renderGuardedApp('/customer/dashboard', ['CUSTOMER']);
      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    });

    test('DRIVER accessing shared /profile -> GRANTED', () => {
      renderGuardedApp('/profile');
      expect(screen.getByText('Shared Profile Page')).toBeInTheDocument();
    });
  });

  describe('Role: CUSTOMER', () => {
    beforeEach(() => {
      useAuth.mockReturnValue({
        user: { role: 'CUSTOMER', email: 'cust@fleetflow.com' },
        role: 'CUSTOMER',
        isAuthenticated: true,
        loading: false,
        logout: jest.fn(),
      });
    });

    test('CUSTOMER accessing /admin/dashboard -> DENIED', () => {
      renderGuardedApp('/admin/dashboard', ['ADMIN']);
      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    });

    test('CUSTOMER accessing /manager/dashboard -> DENIED', () => {
      renderGuardedApp('/manager/dashboard', ['FLEET_MANAGER']);
      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    });

    test('CUSTOMER accessing /driver/dashboard -> DENIED', () => {
      renderGuardedApp('/driver/dashboard', ['DRIVER']);
      expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    });

    test('CUSTOMER accessing /customer/dashboard -> GRANTED', () => {
      renderGuardedApp('/customer/dashboard', ['CUSTOMER']);
      expect(screen.getByText('Customer Dashboard Area')).toBeInTheDocument();
    });

    test('CUSTOMER accessing shared /profile -> GRANTED', () => {
      renderGuardedApp('/profile');
      expect(screen.getByText('Shared Profile Page')).toBeInTheDocument();
    });
  });
});

describe('UnauthorizedPage (403 Access Restricted Screen)', () => {
  test('renders role details, blocked technical route for staff, and action buttons', () => {
    useAuth.mockReturnValue({
      user: { role: 'FLEET_MANAGER', email: 'manager@fleetflow.com' },
      role: 'FLEET_MANAGER',
      isAuthenticated: true,
      logout: jest.fn(),
    });

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/unauthorized',
            state: { from: '/admin/users', allowedRoles: ['ADMIN'] },
          },
        ]}
      >
        <UnauthorizedPage />
      </MemoryRouter>
    );

    // Requirement 4 checks
    expect(screen.getByText(/403/)).toBeInTheDocument();
    expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument();
    expect(screen.getByText(/This page is for:/i)).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText(/You are signed in as:/i)).toBeInTheDocument();
    expect(screen.getByText('Fleet Manager')).toBeInTheDocument();
    // Technical path visible to staff
    expect(screen.getByText('/admin/users')).toBeInTheDocument();

    // Required buttons
    expect(screen.getByRole('button', { name: /go to my dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  test('does not show technical address to customers', () => {
    useAuth.mockReturnValue({
      user: { role: 'CUSTOMER', email: 'cust@fleetflow.com' },
      role: 'CUSTOMER',
      isAuthenticated: true,
      logout: jest.fn(),
    });

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/unauthorized',
            state: { from: '/admin/users', allowedRoles: ['ADMIN'] },
          },
        ]}
      >
        <UnauthorizedPage />
      </MemoryRouter>
    );

    expect(screen.queryByText('/admin/users')).not.toBeInTheDocument();
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });
});

describe('ErrorState Component (In-page API 401, 403, 404 screens)', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { role: 'FLEET_MANAGER' },
      role: 'FLEET_MANAGER',
    });
  });

  test('403 API error renders in-page message and "Go to my dashboard" button without redirect', () => {
    render(
      <MemoryRouter>
        <ErrorState status={403} message="Request failed with status code 403" />
      </MemoryRouter>
    );

    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByText('You do not have permission to view this data')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to my dashboard/i })).toBeInTheDocument();
  });

  test('401 API error renders in-page message and "Login Again" button', () => {
    render(
      <MemoryRouter>
        <ErrorState status={401} message="Token expired" />
      </MemoryRouter>
    );

    expect(screen.getByText('401')).toBeInTheDocument();
    expect(screen.getByText(/Your session has expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login again/i })).toBeInTheDocument();
  });

  test('404 API error renders in-page not found message and dashboard button', () => {
    render(
      <MemoryRouter>
        <ErrorState status={404} message="Booking not found" />
      </MemoryRouter>
    );

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Booking not found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to my dashboard/i })).toBeInTheDocument();
  });
});
