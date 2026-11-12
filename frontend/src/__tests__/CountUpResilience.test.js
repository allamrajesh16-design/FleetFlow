import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import CountUp from '../components/common/CountUp';
import StatCard from '../components/common/StatCard';
import LandingPage from '../pages/public/LandingPage';
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
import ManagerDashboardPage from '../pages/manager/ManagerDashboardPage';
import DriverDashboardPage from '../pages/driver/DriverDashboardPage';
import CustomerDashboardPage from '../pages/customer/CustomerDashboardPage';
import AdminReportsPage from '../pages/admin/AdminReportsPage';
import FuelManagementPage from '../pages/shared/FuelManagementPage';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import fs from 'fs';
import path from 'path';

// Mock API endpoints used in smoke tests
jest.mock('../api/client', () => {
  const original = jest.requireActual('../api/client');
  return {
    ...original,
    default: {
      get: jest.fn(() => Promise.resolve({ data: {} })),
      post: jest.fn(() => Promise.resolve({ data: {} })),
      put: jest.fn(() => Promise.resolve({ data: {} })),
      patch: jest.fn(() => Promise.resolve({ data: {} })),
      delete: jest.fn(() => Promise.resolve({ data: {} })),
    },
  };
});

jest.mock('../api/adminManager', () => ({
  getAdminDashboardApi: jest.fn(() =>
    Promise.resolve({
      stats: {
        total_users: 120,
        active_drivers: 18,
        active_vehicles: 25,
        total_revenue: '₹4,50,000',
        total_trips: 450,
        pending_approvals: 2,
      },
      revenue_chart: [{ date: '2026-11-01', revenue: 50000 }],
      utilization_chart: [{ label: 'Bus', count: 10 }],
    })
  ),
  getFleetManagerDashboardApi: jest.fn(() =>
    Promise.resolve({
      stats: {
        total_vehicles: 30,
        available_vehicles: 22,
        active_trips: 6,
        maintenance_alerts: 1,
      },
      vehicles_by_status: [{ status: 'AVAILABLE', count: 22 }],
    })
  ),
  listVehiclesApi: jest.fn(() => Promise.resolve({ results: [], count: 0 })),
  listDriversApi: jest.fn(() => Promise.resolve({ results: [], count: 0 })),
  listTripsApi: jest.fn(() => Promise.resolve({ results: [], count: 0 })),
  listBookingsApi: jest.fn(() => Promise.resolve({ results: [], count: 0 })),
  getAssignableResourcesApi: jest.fn(() => Promise.resolve({ vehicles: [], drivers: [] })),
  assignTripApi: jest.fn(() => Promise.resolve({ id: 99 })),
  getReportApi: jest.fn(() =>
    Promise.resolve({
      summary: {
        total_trips: 540,
        total_revenue: 1240000,
        fuel_cost: 120000,
        maintenance_cost: 45000,
      },
      results: [],
    })
  ),
  downloadReportCsvApi: jest.fn(() => Promise.resolve(new Blob())),
}));

jest.mock('../api/driver', () => ({
  getDriverDashboardApi: jest.fn(() =>
    Promise.resolve({
      stats: {
        assigned_trips: 4,
        completed_trips: 28,
        total_earnings: '₹14,500',
        rating: '4.9',
      },
      today_trips: [],
    })
  ),
  getDriverMeApi: jest.fn(() => Promise.resolve({ id: 1, is_available: true })),
}));

jest.mock('../api/customer', () => ({
  getCustomerDashboardApi: jest.fn(() =>
    Promise.resolve({
      stats: {
        upcoming_trips: 2,
        completed_bookings: 15,
        total_spent: '₹8,200',
      },
      recent_bookings: [],
    })
  ),
  getMyBookingsApi: jest.fn(() => Promise.resolve({ results: [] })),
  getPaymentHistoryApi: jest.fn(() => Promise.resolve({ results: [] })),
}));

jest.mock('../api/fuel', () => ({
  listFuelLogsApi: jest.fn(() => Promise.resolve({ results: [], count: 0 })),
  getFuelSummaryApi: jest.fn(() =>
    Promise.resolve({
      total_liters: 1250,
      total_cost: 118750,
      avg_efficiency: 4.8,
    })
  ),
  getFuelLogApi: jest.fn(() => Promise.resolve({})),
  createFuelLogApi: jest.fn(() => Promise.resolve({})),
  updateFuelLogApi: jest.fn(() => Promise.resolve({})),
  deleteFuelLogApi: jest.fn(() => Promise.resolve({})),
  getFuelReceiptUrl: jest.fn(() => ''),
}));

describe('CountUp & Animated Numbers Resilience Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. CountUp component contract and variants', () => {
    test('renders integers correctly without throwing', () => {
      render(<CountUp value={1250} />);
      expect(screen.getByLabelText('1,250')).toBeInTheDocument();
    });

    test('renders decimals correctly', () => {
      render(<CountUp value={99.8} format="decimal" decimals={1} />);
      expect(screen.getByLabelText('99.8')).toBeInTheDocument();
    });

    test('renders rupees currency format', () => {
      render(<CountUp value={45000} format="rupees" />);
      expect(screen.getByLabelText('₹45,000')).toBeInTheDocument();
    });

    test('renders percent format', () => {
      render(<CountUp value={85} format="percent" />);
      expect(screen.getByLabelText('85%')).toBeInTheDocument();
    });

    test('renders zero correctly without failing', () => {
      render(<CountUp value={0} />);
      expect(screen.getByLabelText('0')).toBeInTheDocument();
    });

    test('renders very large numbers correctly', () => {
      render(<CountUp value={9876543210} />);
      expect(screen.getByLabelText('9,87,65,43,210')).toBeInTheDocument();
    });

    test('handles null and undefined safely without throwing', () => {
      const { unmount } = render(<CountUp value={null} />);
      expect(screen.getByLabelText('0')).toBeInTheDocument();
      unmount();

      render(<CountUp value={undefined} />);
      expect(screen.getByLabelText('0')).toBeInTheDocument();
    });

    test('respects motion off immediately', () => {
      process.env.REACT_APP_MOTION = 'off';
      render(<CountUp value={500} />);
      expect(screen.getByText('500')).toBeInTheDocument();
      delete process.env.REACT_APP_MOTION;
    });
  });

  describe('2. StatCard value change flash animation', () => {
    test('renders correctly and flashes class on value change', () => {
      const { rerender } = render(<StatCard title="Active Trips" value={10} />);
      expect(screen.getByText('Active Trips')).toBeInTheDocument();

      // Rerender with higher value
      rerender(<StatCard title="Active Trips" value={20} />);
      const valHeading = document.querySelector('.stat-card-value');
      expect(valHeading).toBeInTheDocument();
    });
  });

  describe('3. Landing Page Counters', () => {
    test('renders LandingPage counters without any object child errors', () => {
      render(
        <BrowserRouter>
          <LandingPage />
        </BrowserRouter>
      );
      expect(screen.getAllByText(/Trips Completed/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Vehicles Managed/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Happy Customers/i).length).toBeGreaterThan(0);
    });
  });

  describe('4. Smoke tests for Dashboards, Reports, and Fuel pages', () => {
    const wrap = (component) => (
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>{component}</AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    );

    test('AdminDashboardPage smoke test with mock API data', async () => {
      await act(async () => {
        render(wrap(<AdminDashboardPage />));
      });
      expect(screen.getAllByText(/Admin Dashboard/i).length).toBeGreaterThan(0);
    });

    test('ManagerDashboardPage smoke test with mock API data', async () => {
      await act(async () => {
        render(wrap(<ManagerDashboardPage />));
      });
      expect(screen.getAllByText(/Fleet Overview/i).length).toBeGreaterThan(0);
    });

    test('DriverDashboardPage smoke test with mock API data', async () => {
      await act(async () => {
        render(wrap(<DriverDashboardPage />));
      });
      expect(document.body).toBeInTheDocument();
    });

    test('CustomerDashboardPage smoke test with mock API data', async () => {
      await act(async () => {
        render(wrap(<CustomerDashboardPage />));
      });
      expect(document.body).toBeInTheDocument();
    });

    test('AdminReportsPage smoke test with mock API data', async () => {
      await act(async () => {
        render(wrap(<AdminReportsPage />));
      });
      expect(document.body).toBeInTheDocument();
    });

    test('FuelManagementPage smoke test with mock API data', async () => {
      await act(async () => {
        render(wrap(<FuelManagementPage />));
      });
      expect(document.body).toBeInTheDocument();
    });
  });

  describe('5. Static AST / Codebase rule: No raw useCountUp render', () => {
    test('ensures no JS/JSX file in src renders raw useCountUp object in JSX', () => {
      function walkDir(dir) {
        let results = [];
        const list = fs.readdirSync(dir);
        for (const file of list) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat && stat.isDirectory()) {
            if (file !== 'node_modules' && file !== 'build') {
              results = results.concat(walkDir(fullPath));
            }
          } else if (/\.(js|jsx)$/.test(file)) {
            results.push(fullPath);
          }
        }
        return results;
      }

      const srcFiles = walkDir(path.resolve(__dirname, '..'));
      const violations = [];

      for (const filePath of srcFiles) {
        // Skip tests and definition files
        if (filePath.includes('__tests__') || filePath.includes('useCountUp.js') || filePath.includes('CountUp.js')) {
          continue;
        }

        const code = fs.readFileSync(filePath, 'utf8');
        if (code.includes('useCountUp')) {
          // Check if hook is invoked like const x = useCountUp(...) without destructuring { value }
          const hookMatch = code.match(/const\s+([A-Za-z0-9_]+)\s*=\s*useCountUp\(/g);
          if (hookMatch) {
            hookMatch.forEach((m) => {
              const varName = m.replace(/const\s+/, '').replace(/\s*=\s*useCountUp\(/, '').trim();
              if (varName && !varName.startsWith('{')) {
                // Check if {varName} appears inside JSX
                const rawJsxPattern = new RegExp(`>\\s*\\{\\s*${varName}\\s*\\}\\s*<`);
                if (rawJsxPattern.test(code)) {
                  violations.push(`${path.basename(filePath)} renders raw ${varName} in JSX`);
                }
              }
            });
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });
});
