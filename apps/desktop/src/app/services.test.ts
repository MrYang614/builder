import { describe, expect, it } from 'vitest';
import { Signal } from './services';

describe('Signal subscriber dispatch', () => {
  it('fixes the current dispatch scope when subscriptions change during notification', () => {
    const signal = new Signal(0);
    const calls: string[] = [];
    let detachNext = () => {};
    signal.subscribe(() => {
      calls.push('first');
      detachNext();
      signal.subscribe(() => calls.push('late'));
    });
    detachNext = signal.subscribe(() => calls.push('next'));
    signal.set(1);
    expect(calls).toEqual(['first', 'next']);
    signal.set(2);
    expect(calls).toEqual(['first', 'next', 'first', 'late']);
  });
});
