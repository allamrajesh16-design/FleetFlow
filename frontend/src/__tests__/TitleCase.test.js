import { toTitleCase, displayText, formatPlaceName } from '../utils/formatters';

describe('toTitleCase and displayText formatter tests', () => {
  test('formats all lowercase words to Title Case', () => {
    expect(toTitleCase('kakinada main road')).toBe('Kakinada Main Road');
    expect(toTitleCase('rajahmundry')).toBe('Rajahmundry');
  });

  test('preserves words that already have capitals or 2 to 3 letter abbreviations', () => {
    expect(toTitleCase('WT City Terminal')).toBe('WT City Terminal');
    expect(toTitleCase('AP 05 Airport')).toBe('AP 05 Airport');
    expect(toTitleCase('DL 01 Express')).toBe('DL 01 Express');
  });

  test('formatPlaceName preserves words containing capitals or 2 to 3 letters long (WT, AP, KA)', () => {
    expect(formatPlaceName('WT City Terminal')).toBe('WT City Terminal');
    expect(formatPlaceName('Wt City Terminal')).toBe('WT City Terminal');
    expect(formatPlaceName('wt city terminal')).toBe('WT City Terminal');
    expect(formatPlaceName('AP 05 Bus Stand')).toBe('AP 05 Bus Stand');
    expect(formatPlaceName('KA Central Station')).toBe('KA Central Station');
    expect(formatPlaceName('kakinada')).toBe('Kakinada');
    expect(formatPlaceName('rajahmundry to kakinada')).toBe('Rajahmundry To Kakinada');
  });

  test('converts all-uppercase words longer than 4 letters to title case', () => {
    expect(toTitleCase('AIRPORT TERMINAL')).toBe('Airport Terminal');
    expect(toTitleCase('KAKINADA')).toBe('Kakinada');
  });

  test('displayText handles empty or null gracefully', () => {
    expect(displayText(null)).toBe('—');
    expect(displayText('')).toBe('—');
    expect(displayText('kakinada')).toBe('Kakinada');
    expect(displayText('WT City Terminal')).toBe('WT City Terminal');
  });
});

