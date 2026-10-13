import type { ComponentProps } from 'react';
import { Separator as Primitive } from '../primitives/separator';

export type SeparatorProps = Omit<
  ComponentProps<typeof Primitive>,
  'className' | 'style' | 'asChild'
>;

export function Separator(props: SeparatorProps) {
  return <Primitive {...props} />;
}
