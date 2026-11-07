import React from 'react';
import { render, screen } from '@testing-library/react';
import ManagerApprovalsPage from '../pages/manager/ManagerApprovalsPage';
import ManagerBusMonitorPage from '../pages/manager/ManagerBusMonitorPage';
import { ToastProvider } from '../context/ToastContext';
import useApiList from '../hooks/useApiList';

// Mock useApiList so we can inject items with completely null fields
jest.mock('../hooks/useApiList');

describe('Approvals and Bus Monitor Pages with null fields', () => {
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = jest.fn();
    jest.clearAllMocks();
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  test('ManagerApprovalsPage renders without crashing when items have null fields', () => {
    // Mock bookings list with null customer, locations, status, vehicle, driver
    const mockBookingsItem = {
      id: 55,
      customer: null,
      customer_name: null,
      customer_email: null,
      pickup_location: null,
      drop_location: null,
      vehicle_type: null,
      driver: null,
      driver_name: null,
      status: null,
      created_at: null,
      pickup_datetime: null,
      estimated_fare: null,
    };

    // Mock driver approvals item with null user fields
    const mockDriverItem = {
      id: 88,
      full_name: null,
      email: null,
      phone: null,
      role: null,
      is_approved: null,
      created_at: null,
    };

    useApiList.mockImplementation(({ endpoint }) => {
      if (endpoint === '/bookings/') {
        return {
          rows: [mockBookingsItem],
          data: [mockBookingsItem],
          count: 1,
          totalCount: 1,
          totalPages: 1,
          page: 1,
          loading: false,
          error: null,
          search: '',
          filters: {},
          setPage: jest.fn(),
          setSearch: jest.fn(),
          setFilter: jest.fn(),
          refresh: jest.fn(),
        };
      }
      return {
        rows: [mockDriverItem],
        data: [mockDriverItem],
        count: 1,
        totalCount: 1,
        totalPages: 1,
        page: 1,
        loading: false,
        error: null,
        search: '',
        filters: {},
        setPage: jest.fn(),
        setSearch: jest.fn(),
        setFilter: jest.fn(),
        refresh: jest.fn(),
      };
    });

    render(
      <ToastProvider>
        <ManagerApprovalsPage />
      </ToastProvider>
    );

    // Verify page rendered safely
    expect(screen.getByText('Pending Approvals')).toBeInTheDocument();
    // Verify booking row 55 rendered safely with fallbacks
    expect(screen.getAllByText(/BKG-0055/).length).toBeGreaterThan(0);
  });

  test('ManagerBusMonitorPage renders without crashing when bus schedules have null fields', () => {
    const mockBusSchedule = {
      id: 99,
      bus_number: null,
      route_name: null,
      source: null,
      destination: null,
      driver: null,
      driver_name: null,
      departure_time: null,
      booking_cutoff_time: null,
      fare: null,
      status: null,
      total_seats: null,
      booked_seats: null,
      available_seats: null,
    };

    useApiList.mockReturnValue({
      rows: [mockBusSchedule],
      data: [mockBusSchedule],
      count: 1,
      totalCount: 1,
      totalPages: 1,
      page: 1,
      loading: false,
      error: null,
      search: '',
      filters: {},
      setPage: jest.fn(),
      setSearch: jest.fn(),
      setFilter: jest.fn(),
      refresh: jest.fn(),
    });

    render(<ManagerBusMonitorPage />);

    // Verify header and page content rendered safely
    expect(screen.getByText('Bus Passenger Monitor')).toBeInTheDocument();
    expect(screen.getByText(/Booking Deadline: 10 Hours Before Departure/i)).toBeInTheDocument();
  });
});
