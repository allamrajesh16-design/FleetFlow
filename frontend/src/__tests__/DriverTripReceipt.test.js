import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import DriverTripReceipt from '../components/driver/DriverTripReceipt';
import { ToastContext } from '../context/ToastContext';

const mockToast = {
  success: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
};

const mockTrip = {
  id: 101,
  booking_id: 42,
  customer_name: 'Anil Sharma',
  driver_name: 'Suresh Kumar',
  vehicle_registration: 'AP05WT0002',
  vehicle_brand_model: 'Honda Activa WT',
  pickup_location: 'Vetlapalem',
  drop_location: 'Kakinada',
  started_at: '2026-11-10T14:30:00Z',
  completed_at: '2026-11-10T15:15:00Z',
  start_odometer: 15200,
  end_odometer: 15245,
  distance_km: 45,
  total_fare: '675.00',
  status: 'COMPLETED',
  receipt_data: {
    receipt_number: 'FF-2026-000101',
    payment_method: 'Cash',
    payment_status: 'PAID',
    transaction_reference: 'CASH-SETTLED',
  },
};

const renderWithProviders = (ui) => {
  return render(
    <ToastContext.Provider value={mockToast}>
      <BrowserRouter>{ui}</BrowserRouter>
    </ToastContext.Provider>
  );
};

describe('DriverTripReceipt Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.print = jest.fn();
  });

  test('renders FleetFlow logo and official branding', () => {
    renderWithProviders(<DriverTripReceipt trip={mockTrip} />);
    expect(screen.getByText('FleetFlow')).toBeInTheDocument();
    expect(screen.getByText(/Smart Fleet Mobility Receipt/i)).toBeInTheDocument();
    expect(screen.getByText(/Official Receipt/i)).toBeInTheDocument();
  });

  test('renders all core trip, odometer, distance and fare fields', () => {
    renderWithProviders(<DriverTripReceipt trip={mockTrip} />);

    // Receipt Number
    expect(screen.getAllByText('FF-2026-000101').length).toBeGreaterThan(0);

    // Trip ID & Booking ID
    expect(screen.getByText('#101')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();

    // Customer & Driver
    expect(screen.getByText('Anil Sharma')).toBeInTheDocument();
    expect(screen.getByText('Suresh Kumar')).toBeInTheDocument();

    // Vehicle
    expect(screen.getByText('AP05WT0002')).toBeInTheDocument();

    // Locations
    expect(screen.getByText('Vetlapalem')).toBeInTheDocument();
    expect(screen.getByText('Kakinada')).toBeInTheDocument();

    // Odometer & Distance
    expect(screen.getByText('15200 km')).toBeInTheDocument();
    expect(screen.getByText('15245 km')).toBeInTheDocument();
    expect(screen.getByText('45 km')).toBeInTheDocument();

    // Fares
    expect(screen.getAllByText('₹675.00').length).toBeGreaterThan(0);
    expect(screen.getByText('₹0.00')).toBeInTheDocument();

    // Payment details
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('CASH-SETTLED')).toBeInTheDocument();
  });

  test('triggers window.print when Print Receipt button is clicked', () => {
    renderWithProviders(<DriverTripReceipt trip={mockTrip} />);
    const printBtn = screen.getByRole('button', { name: /Print Receipt/i });
    fireEvent.click(printBtn);
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});

