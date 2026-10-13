import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Numeric } from '../apps/desktop/src/ui/fields';

function display(value: number): string {
  const html = renderToStaticMarkup(
    createElement(Numeric, { label: 'Dimension', value, onCommit: () => true }),
  );
  return html.match(/\bvalue="([^"]*)"/)![1]!;
}

describe('numeric dimension display', () => {
  it('removes grid arithmetic tails while retaining meaningful decimal precision', () => {
    expect(display(7.800000000000001)).toBe('7.8');
    expect(display(-4.1000000000000005)).toBe('-4.1');
    expect(display(0.30000000000000004)).toBe('0.3');
    expect(display(0.123456789123456)).toBe('0.123456789123456');
    expect(display(-0)).toBe('0');
  });

  it('keeps small finite dimensions visible and does not overflow the largest value', () => {
    for (const value of [1e-20, -1e-20, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE]) {
      const text = display(value);
      expect(Number(text), text).not.toBe(0);
      expect(Number.isFinite(Number(text)), text).toBe(true);
      expect(Number(text)).toBe(value);
    }
  });
});
