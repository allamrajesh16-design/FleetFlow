import { getTimeOfDay, getTimeOfDayMeta, getProgressColor } from '../utils/motionTimeAndColor';
import { getMotionLevel, applyMotionLevel } from '../utils/motionLevel';

describe('Motion Time, Progress & Level Helpers', () => {
  describe('getTimeOfDay', () => {
    test('returns morning between 5 and 11', () => {
      const morningDate = new Date('2026-10-30T09:00:00');
      expect(getTimeOfDay(morningDate)).toBe('morning');
    });

    test('returns afternoon between 12 and 16', () => {
      const afternoonDate = new Date('2026-10-30T14:30:00');
      expect(getTimeOfDay(afternoonDate)).toBe('afternoon');
    });

    test('returns evening between 17 and 4', () => {
      const eveningDate = new Date('2026-10-30T20:00:00');
      expect(getTimeOfDay(eveningDate)).toBe('evening');

      const lateNightDate = new Date('2026-10-30T02:00:00');
      expect(getTimeOfDay(lateNightDate)).toBe('evening');
    });

    test('getTimeOfDayMeta provides icon, label and valid stops', () => {
      const meta = getTimeOfDayMeta(new Date('2026-10-30T09:00:00'));
      expect(meta.period).toBe('morning');
      expect(meta.icon).toBe('☀️');
      expect(meta.label).toBe('Good morning');
      expect(meta.stopA).toBeDefined();
      expect(meta.stopB).toBeDefined();
    });
  });

  describe('getProgressColor', () => {
    test('returns danger status below 40%', () => {
      const res = getProgressColor(25);
      expect(res.status).toBe('low');
      expect(res.token).toContain('danger');
    });

    test('returns amber warning status between 40% and 79%', () => {
      const res = getProgressColor(60);
      expect(res.status).toBe('medium');
      expect(res.token).toContain('amber');
    });

    test('returns success status for 80% and above', () => {
      const res = getProgressColor(85);
      expect(res.status).toBe('target_met');
      expect(res.token).toContain('success');
    });
  });

  describe('getMotionLevel & applyMotionLevel', () => {
    const origEnv = process.env.REACT_APP_MOTION;

    afterEach(() => {
      process.env.REACT_APP_MOTION = origEnv;
      jest.restoreAllMocks();
    });

    test('returns off when REACT_APP_MOTION is off', () => {
      process.env.REACT_APP_MOTION = 'off';
      expect(getMotionLevel()).toBe('off');
    });

    test('returns off when prefers-reduced-motion is true', () => {
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query.includes('prefers-reduced-motion: reduce'),
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
      }));
      expect(getMotionLevel()).toBe('off');
    });

    test('applies data-motion attribute to html documentElement', () => {
      applyMotionLevel('lite');
      expect(document.documentElement.getAttribute('data-motion')).toBe('lite');

      applyMotionLevel('full');
      expect(document.documentElement.getAttribute('data-motion')).toBe('full');
    });
  });
});

