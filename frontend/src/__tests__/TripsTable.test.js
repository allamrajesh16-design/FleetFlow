import React from 'react';
import { render, screen } from '@testing-library/react';
import DataTable from '../components/common/DataTable';
import { normalizeList } from '../utils/safeHelpers';

describe('Trips Table and DataTable Safety', () => {
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = jest.fn();
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  const tripColumns = [
    {
      key: 'id',
      label: 'ID',
      render: (t) => `#${t?.id ?? '-'}`,
    },
    {
      key: 'route',
      label: 'Route',
      render: (t) => {
        const from = t?.source || t?.pickup_location || '-';
        const to = t?.destination || t?.drop_location || '-';
        const sub = t?.bus_schedule
          ? 'Bus Schedule'
          : t?.booking
          ? `Booking #${t.booking}`
          : 'Direct Assignment';
        return `${from} → ${to} (${sub})`;
      },
    },
    {
      key: 'vehicle',
      label: 'Vehicle',
      render: (t) => t?.vehicle_registration || (t?.vehicle ? `Vehicle #${t.vehicle}` : '-'),
    },
    {
      key: 'driver',
      label: 'Driver',
      render: (t) => t?.driver_name || (t?.driver ? `Driver #${t.driver}` : 'Unassigned'),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (t) => t?.customer_name || (t?.booking ? 'Customer' : (t?.bus_schedule ? 'Bus Passengers' : '-')),
    },
  ];

  test('(a) renders car trip with booking and no bus_schedule', () => {
    const carTrip = {
      id: 10,
      booking: 101,
      bus_schedule: null,
      source: 'Kakinada Port',
      destination: 'Rajahmundry Airport',
      vehicle_registration: 'AP-05-TX-1001',
      driver_name: 'Ravi Kumar',
      customer_name: 'John Doe',
      status: 'SCHEDULED',
    };

    render(<DataTable columns={tripColumns} data={[carTrip]} />);

    expect(screen.getAllByText('#10').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kakinada Port → Rajahmundry Airport (Booking #101)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AP-05-TX-1001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ravi Kumar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);
  });

  test('(b) renders bus trip with bus_schedule and no booking', () => {
    const busTrip = {
      id: 20,
      booking: null,
      bus_schedule: 501,
      source: 'Vijayawada Central',
      destination: 'Hyderabad MGBS',
      vehicle_registration: 'AP-16-BS-2002',
      driver_name: 'Suresh Raina',
      customer_name: 'Bus Passengers',
      status: 'SCHEDULED',
    };

    render(<DataTable columns={tripColumns} data={[busTrip]} />);

    expect(screen.getAllByText('#20').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vijayawada Central → Hyderabad MGBS (Bus Schedule)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AP-16-BS-2002').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Suresh Raina').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bus Passengers').length).toBeGreaterThan(0);
  });

  test('(c) renders trip with both booking and bus_schedule null, and missing fields', () => {
    const blankTrip = {
      id: 30,
      booking: null,
      bus_schedule: null,
      source: null,
      destination: null,
      pickup_location: null,
      drop_location: null,
      vehicle: null,
      vehicle_registration: null,
      driver: null,
      driver_name: null,
      customer_name: null,
    };

    render(<DataTable columns={tripColumns} data={[blankTrip]} />);

    expect(screen.getAllByText('#30').length).toBeGreaterThan(0);
    expect(screen.getAllByText('- → - (Direct Assignment)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
  });

  test('(d) renders cleanly with empty list without crashing', () => {
    render(<DataTable columns={tripColumns} data={[]} />);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });

  test('(e) handles both paginated response object and plain array response', () => {
    const item1 = {
      id: 1,
      source: 'City A',
      destination: 'City B',
      booking: 12,
      bus_schedule: null,
    };
    const item2 = {
      id: 2,
      source: 'City C',
      destination: 'City D',
      booking: null,
      bus_schedule: 34,
    };

    // 1. Plain array
    const { unmount } = render(<DataTable columns={tripColumns} data={[item1, item2]} />);
    expect(screen.getAllByText('#1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#2').length).toBeGreaterThan(0);
    unmount();

    // 2. Paginated object { count, results } normalized with normalizeList
    const paginatedResponse = {
      count: 2,
      results: [item1, item2],
    };
    const normalized = normalizeList(paginatedResponse);
    render(<DataTable columns={tripColumns} data={normalized.items} totalCount={normalized.count} />);
    expect(screen.getAllByText('#1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#2').length).toBeGreaterThan(0);
  });

  test('DataTable cell error protection: failing render in one cell displays "-" and does not crash the table', () => {
    const buggyColumns = [
      { key: 'id', label: 'ID', render: (t) => `#${t.id}` },
      {
        key: 'buggy',
        label: 'Buggy Column',
        render: (t) => {
          if (t.id === 999) {
            // Intentionally reading undefined nested property
            return t.nonExistent.subField.value;
          }
          return 'Healthy Cell';
        },
      },
    ];

    const data = [
      { id: 1 },
      { id: 999 }, // this row throws in buggy column
      { id: 2 },
    ];

    render(<DataTable columns={buggyColumns} data={data} />);

    // Row 1 and Row 2 should render healthy cells
    expect(screen.getAllByText('#1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Healthy Cell').length).toBeGreaterThan(0);

    // Row 999 should render fallback '-'
    expect(screen.getAllByText('#999').length).toBeGreaterThan(0);

    // Verify console error was captured with row id and column
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[DataTable] Cell render error in column "buggy" for row id "999":'),
      expect.any(Error)
    );
  });
});
