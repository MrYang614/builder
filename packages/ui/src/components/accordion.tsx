import type { ReactNode } from 'react';
import {
  Accordion as Primitive,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '../primitives/accordion';

export interface AccordionItemData {
  value: string;
  title: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export type AccordionProps = { items: readonly AccordionItemData[]; disabled?: boolean } & (
  | {
      type?: 'single';
      value?: string;
      defaultValue?: string;
      onValueChange?: (value: string) => void;
      collapsible?: boolean;
    }
  | {
      type: 'multiple';
      value?: string[];
      defaultValue?: string[];
      onValueChange?: (value: string[]) => void;
      collapsible?: never;
    }
);

export function Accordion({ items, ...props }: AccordionProps) {
  const content = items.map((item) => (
    <AccordionItem
      key={item.value}
      value={item.value}
      disabled={item.disabled}
      className="border-b last:border-b-0"
    >
      <AccordionTrigger>{item.title}</AccordionTrigger>
      <AccordionContent>{item.content}</AccordionContent>
    </AccordionItem>
  ));
  return props.type === 'multiple' ? (
    <Primitive {...props}>{content}</Primitive>
  ) : (
    <Primitive {...props} type="single" collapsible={props.collapsible ?? true}>
      {content}
    </Primitive>
  );
}
