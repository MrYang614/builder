import { useArgs } from 'storybook/preview-api';
import { Playground } from '../playground/playground';
import type { ArgTypes, StoryContext } from '@storybook/react-vite';
import type { ExampleDefinition } from '../playground/playground';
import type { ConfigSchema, PreviewArgs } from '../playground/schema';
import { parseConfig } from '../playground/schema';

/** Derives Controls from the same schema used by the JSON editor. */
export function controls(schema: ConfigSchema): ArgTypes {
  return Object.fromEntries(
    Object.entries(schema).map(([key, field]) => [
      key,
      {
        description: field.description,
        control: field.options
          ? { type: 'select' }
          : {
              type:
                field.type === 'string'
                  ? 'text'
                  : field.type === 'array' || field.type === 'object'
                    ? 'object'
                    : field.type,
            },
        options: field.options,
        table: {
          type: { summary: field.type },
          defaultValue: {
            summary: field.defaultLabel ?? JSON.stringify(field.defaultValue) ?? 'Not set',
          },
        },
      },
    ]),
  );
}

/** Storybook owns applied args; React owns only source/config text drafts inside Playground. */
export function renderExample(example: ExampleDefinition) {
  return function Render(_args: PreviewArgs, context: StoryContext) {
    const [args, updateArgs, resetArgs] = useArgs<PreviewArgs>();
    const initialArgs = parseConfig(JSON.stringify(context.initialArgs), example.schema);
    function replaceArgs(next: PreviewArgs) {
      const removed = Object.keys(args).filter((key) => !Object.hasOwn(next, key));
      if (removed.length) {
        resetArgs(removed);
      }
      updateArgs(next);
    }
    return (
      <Playground
        key={context.id}
        storyId={context.id}
        example={example}
        args={args}
        initialArgs={initialArgs}
        resetArgs={resetArgs}
        updateArgs={replaceArgs}
        theme={String(context.globals.theme)}
        width={String(context.globals.width)}
      />
    );
  };
}
