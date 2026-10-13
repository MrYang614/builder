import type { ExampleDefinition } from '../playground/playground';
import { parseConfig } from '../playground/schema';
import { componentDefaults } from '../config/component-defaults';
import type { ConfigSchema } from '../playground/schema';

/** Stores repository baselines separately from mutable Storybook args and browser drafts. */
export function defineExample(
  name: string,
  source: string,
  config: unknown,
  schema: ConfigSchema,
  notes: string,
  keyboard: string,
  api: ExampleDefinition['api'] = [],
): ExampleDefinition {
  return {
    name,
    source,
    config: parseConfig(JSON.stringify(config), schema),
    schema: componentDefaults(name, schema),
    notes,
    keyboard,
    api,
  };
}
