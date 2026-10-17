import { describe, expect, it } from 'vitest';
import { numberPrecision, numericDisplay, numericDraft } from './number-format';

describe('optional numeric precision', () => {
  it.each([
    [11.133302328968, '11.13'],
    [-4.607886956664, '-4.61'],
    [1.005, '1.01'],
    [-1.005, '-1.01'],
    [9.999, '10'],
    [0.004, '0'],
    [-0.004, '0'],
    [-0, '0'],
    [0.1 + 0.2, '0.3'],
  ])('formats %s to at most two decimal places', (value, expected) => {
    expect(numericDisplay(value, 2)).toBe(expected);
  });

  it.each([
    ['11.133302328968', '11.13'],
    ['-4.607886956664', '-4.61'],
    ['1.005', '1.01'],
    ['-1.005', '-1.01'],
    ['1e3', '1000'],
    ['1e-3', '0'],
    [' 1.234 ', '1.23'],
    ['1.20', '1.20'],
    ['1.', '1.'],
    ['.5', '.5'],
    ['-', '-'],
    ['.', '.'],
    ['1e-', '1e-'],
    ['1e999', '1e999'],
    ['Infinity', 'Infinity'],
    ['1.2.3', '1.2.3'],
    ['', ''],
  ])('normalizes the complete draft %s without losing recoverable input', (text, expected) => {
    expect(numericDraft(text, 2)).toBe(expected);
  });

  it('keeps the generic unconfigured precision contract and tiny values', () => {
    expect(numericDisplay(0.123456789123456)).toBe('0.123456789123456');
    for (const value of [1e-20, -1e-20, Number.MIN_VALUE, Number.MAX_VALUE]) {
      expect(Number(numericDisplay(value))).toBe(value);
    }
    expect(numericDraft('1.23456789123456789')).toBe('1.23456789123456789');
    expect(numericDisplay(null, 2)).toBe('');
    expect(numericDisplay(12.3456, 3)).toBe('12.346');
  });

  it('bounds configured precision and handles nonfinite display without throwing', () => {
    expect(numberPrecision()).toBeUndefined();
    expect(numberPrecision(NaN)).toBeUndefined();
    expect(numberPrecision(Infinity)).toBeUndefined();
    expect(numberPrecision(-1)).toBe(0);
    expect(numberPrecision(99)).toBe(15);
    expect(numberPrecision(2.9)).toBe(2);
    expect(numericDisplay(NaN, 2)).toBe('NaN');
    expect(numericDisplay(Infinity, 2)).toBe('Infinity');
  });
});
