import { safeGet, normalizeList } from '../utils/safeHelpers';

describe('safeHelpers', () => {
  describe('safeGet', () => {
    test('retrieves nested properties safely', () => {
      const obj = { user: { profile: { name: 'Alice' } } };
      expect(safeGet(obj, 'user.profile.name')).toBe('Alice');
    });

    test('returns fallback for missing or undefined paths', () => {
      const obj = { user: null };
      expect(safeGet(obj, 'user.profile.name', 'Unknown')).toBe('Unknown');
      expect(safeGet(null, 'user.profile.name', '-')).toBe('-');
      expect(safeGet(undefined, 'any.path', 'fallback')).toBe('fallback');
      expect(safeGet({ a: { b: undefined } }, 'a.b', 'N/A')).toBe('N/A');
    });
  });

  describe('normalizeList', () => {
    test('handles null and undefined', () => {
      expect(normalizeList(null)).toEqual({ items: [], count: 0 });
      expect(normalizeList(undefined)).toEqual({ items: [], count: 0 });
    });

    test('handles plain arrays', () => {
      const arr = [{ id: 1 }, { id: 2 }];
      expect(normalizeList(arr)).toEqual({ items: arr, count: 2 });
    });

    test('handles DRF paginated responses with results', () => {
      const resp = { count: 50, results: [{ id: 1 }, { id: 2 }] };
      expect(normalizeList(resp)).toEqual({ items: resp.results, count: 50 });
    });

    test('handles custom paginated responses with rows or data', () => {
      const resp1 = { count: 12, rows: [{ id: 1 }] };
      expect(normalizeList(resp1)).toEqual({ items: resp1.rows, count: 12 });

      const resp2 = { count: 5, data: [{ id: 10 }] };
      expect(normalizeList(resp2)).toEqual({ items: resp2.data, count: 5 });
    });
  });
});
