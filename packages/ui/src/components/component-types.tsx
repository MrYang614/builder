import { isValidElement, type ComponentType, type ReactElement, type SVGProps } from 'react';

export type ComponentSize = 'sm' | 'md' | 'lg';
export type ComponentWidth = 'auto' | 'full';
export type ComponentIcon = ReactElement | ComponentType<SVGProps<SVGSVGElement>>;

/** Icons accept either a node or a component; their visual sizing stays inside the family. */
export function renderIcon(icon: ComponentIcon) {
  if (isValidElement(icon)) {
    return icon;
  }
  const Icon = icon;
  return <Icon aria-hidden="true" />;
}
