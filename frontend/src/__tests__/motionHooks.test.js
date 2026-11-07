import { renderHook, act } from '@testing-library/react';
import useCountUp from '../hooks/useCountUp';
import useReveal from '../hooks/useReveal';

describe('Motion Hooks', () => {
  const originalEnv = process.env.REACT_APP_MOTION;

  beforeEach(() => {
    delete process.env.REACT_APP_MOTION;
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  afterEach(() => {
    process.env.REACT_APP_MOTION = originalEnv;
    jest.restoreAllMocks();
  });

  describe('useCountUp', () => {
    test('shows final value immediately when REACT_APP_MOTION=off', () => {
      process.env.REACT_APP_MOTION = 'off';
      const { result } = renderHook(() => useCountUp('10,480'));
      expect(result.current.value).toBe('10,480');
      expect(result.current.numericValue).toBe(10480);
    });

    test('shows final value immediately when prefers-reduced-motion is active', () => {
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      const { result } = renderHook(() => useCountUp('85,200'));
      expect(result.current.value).toBe('85,200');
      expect(result.current.numericValue).toBe(85200);
    });

    test('formats rupees correctly when motion is off', () => {
      process.env.REACT_APP_MOTION = 'off';
      const { result } = renderHook(() => useCountUp('₹48,000'));
      expect(result.current.value).toBe('₹48,000');
    });

    test('counts up smoothly to target value when motion is enabled', () => {
      const rafCallbacks = [];
      jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });

      const { result } = renderHook(() => useCountUp(100, { duration: 800 }));
      expect(result.current.numericValue).toBe(0);

      // First tick sets startTime
      act(() => {
        if (rafCallbacks.length > 0) {
          const cb = rafCallbacks.shift();
          cb(1000);
        }
      });

      // Second tick completes duration
      act(() => {
        if (rafCallbacks.length > 0) {
          const cb = rafCallbacks.shift();
          cb(1900);
        }
      });

      expect(result.current.numericValue).toBe(100);
      expect(result.current.value).toBe('100');
    });
  });

  describe('useReveal', () => {
    test('reveals immediately when REACT_APP_MOTION=off', () => {
      process.env.REACT_APP_MOTION = 'off';
      const { result } = renderHook(() => useReveal());
      expect(result.current.isVisible).toBe(true);
    });

    test('reveals immediately when prefers-reduced-motion is active', () => {
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      const { result } = renderHook(() => useReveal());
      expect(result.current.isVisible).toBe(true);
    });

    test('creates intersection observer and handles observe when motion is enabled', () => {
      let observerCallback = null;
      const mockObserve = jest.fn();
      const mockDisconnect = jest.fn();

      window.IntersectionObserver = jest.fn().mockImplementation((cb) => {
        observerCallback = cb;
        return {
          observe: mockObserve,
          unobserve: jest.fn(),
          disconnect: mockDisconnect,
        };
      });

      const { result } = renderHook(() => useReveal({ threshold: 0.1 }));
      expect(result.current.isVisible).toBe(false);

      const fakeElement = document.createElement('div');
      act(() => {
        result.current.ref.current = fakeElement;
      });
    });
  });
});
