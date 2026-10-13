import { describe, expect, it } from 'vitest';
import { parseConfig, validateObject } from './schema';
import { options } from '../config/common';
import type { ConfigSchema } from './schema';

const schema: ConfigSchema = {
  disabled: { type: 'boolean', description: 'Interaction availability.' },
  size: { type: 'string', options: ['sm', 'md', 'lg'], description: 'Control density.' },
  count: { type: 'number', minimum: 0, maximum: 100, description: 'Bounded amount.' },
  options,
};

describe('temporary configuration boundary', () => {
  it('accepts serializable bilingual options without mutating the caller', () => {
    const value = {
      disabled: true,
      size: 'lg',
      options: [{ value: '庭院', label: 'Courtyard / 庭院' }],
    };
    const before = JSON.stringify(value);
    expect(parseConfig(before, schema)).toEqual(value);
    expect(JSON.stringify(value)).toBe(before);
  });

  it('rejects syntax errors, non-object roots and undocumented appearance or callback props', () => {
    expect(() => parseConfig('{', schema)).toThrow();
    for (const source of ['null', '[]', '"text"']) {
      expect(() => parseConfig(source, schema)).toThrow('must be a JSON object');
    }
    for (const key of ['className', 'style', 'onClick', '__proto__']) {
      expect(() => parseConfig(`{"${key}":"unsupported"}`, schema)).toThrow(
        'not a configurable prop',
      );
    }
  });

  it('reports scalar types, enums and finite numeric limits before previewing', () => {
    expect(() => parseConfig('{"disabled":"true"}', schema)).toThrow('disabled must be boolean');
    expect(() => parseConfig('{"size":"huge"}', schema)).toThrow('size must be one of');
    expect(() => parseConfig('{"count":101}', schema)).toThrow('outside its allowed range');
    expect(validateObject({ count: Infinity }, schema)).toContain('outside its allowed range');
  });

  it('requires complete option identities and rejects duplicates and malformed nested values', () => {
    expect(() => parseConfig('{"options":[{"label":"Missing ID"}]}', schema)).toThrow(
      'value is required',
    );
    expect(() => parseConfig('{"options":[{"value":"","label":"Empty ID"}]}', schema)).toThrow(
      'at least 1',
    );
    expect(() => parseConfig('{"options":[{"value":"a","label":12}]}', schema)).toThrow(
      'label must be string',
    );
    expect(() =>
      parseConfig('{"options":[{"value":"a","label":"A"},{"value":"a","label":"B"}]}', schema),
    ).toThrow('identifiers must be unique');
    expect(() =>
      parseConfig('{"options":[{"value":"a","label":"A","disabled":"no"}]}', schema),
    ).toThrow('disabled must be boolean');
  });
});
