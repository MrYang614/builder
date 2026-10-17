import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InputNumber } from '@building/ui';
import { Numeric } from '../apps/desktop/src/ui/fields';

function display(value: number): string {
  const html = renderToStaticMarkup(
    createElement(Numeric, { label: 'Dimension', value, onCommit: () => true }),
  );
  return html.match(/\bvalue="([^"]*)"/)![1]!;
}

describe('numeric dimension display', () => {
  it('limits editor dimensions to two decimal places without padding shorter values', () => {
    expect(display(7.800000000000001)).toBe('7.8');
    expect(display(-4.1000000000000005)).toBe('-4.1');
    expect(display(0.30000000000000004)).toBe('0.3');
    expect(display(0.123456789123456)).toBe('0.12');
    expect(display(11.133302328968)).toBe('11.13');
    expect(display(-4.607886956664)).toBe('-4.61');
    expect(display(1.005)).toBe('1.01');
    expect(display(-1.005)).toBe('-1.01');
    expect(display(9.999)).toBe('10');
    expect(display(-0)).toBe('0');
    expect(display(-0.001)).toBe('0');
    expect(display(1e-20)).toBe('0');
  });

  it('preserves the generic input precision contract when precision is not configured', () => {
    for (const value of [1e-20, -1e-20, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE]) {
      const html = renderToStaticMarkup(createElement(InputNumber, { value }));
      const text = html.match(/\bvalue="([^"]*)"/)![1]!;
      expect(Number(text), text).not.toBe(0);
      expect(Number.isFinite(Number(text)), text).toBe(true);
      expect(Number(text)).toBe(value);
    }
    const html = renderToStaticMarkup(createElement(InputNumber, { value: 0.123456789123456 }));
    expect(html).toContain('value="0.123456789123456"');
  });
});
