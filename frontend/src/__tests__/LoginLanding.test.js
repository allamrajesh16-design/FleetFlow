import { getHomePath } from '../context/AuthContext';

describe('Login landing and getHomePath role destinations', () => {
  test('ADMIN lands on /admin/dashboard', () => {
    expect(getHomePath('ADMIN')).toBe('/admin/dashboard');
    expect(getHomePath('admin')).toBe('/admin/dashboard');
  });

  test('FLEET_MANAGER lands on /manager/dashboard', () => {
    expect(getHomePath('FLEET_MANAGER')).toBe('/manager/dashboard');
    expect(getHomePath('fleet_manager')).toBe('/manager/dashboard');
  });

  test('DRIVER lands on /driver/dashboard', () => {
    expect(getHomePath('DRIVER')).toBe('/driver/dashboard');
    expect(getHomePath('driver')).toBe('/driver/dashboard');
  });

  test('CUSTOMER lands on /customer/dashboard', () => {
    expect(getHomePath('CUSTOMER')).toBe('/customer/dashboard');
    expect(getHomePath('customer')).toBe('/customer/dashboard');
  });

  test('unknown role or empty redirects safely', () => {
    expect(getHomePath(null)).toBe('/login');
    expect(getHomePath('')).toBe('/login');
    expect(getHomePath('GUEST')).toBe('/');
  });
});

