import '@testing-library/jest-dom';

// Mock Leaflet and react-leaflet for Jest / jsdom environment
jest.mock('leaflet', () => ({
  divIcon: jest.fn(() => ({})),
  icon: jest.fn(() => ({})),
}));

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="mock-map-container">{children}</div>,
  TileLayer: () => <div data-testid="mock-tile-layer" />,
  Marker: ({ children }) => <div data-testid="mock-marker">{children}</div>,
  Popup: ({ children }) => <div data-testid="mock-popup">{children}</div>,
  useMap: () => ({ setView: jest.fn() }),
}));
