import type { Meta, StoryObj } from '@storybook/react-vite';
import { tabs as example } from '../examples/organization-definitions';
import { controls, renderExample } from './story-helpers';
import type { PreviewArgs } from '../playground/schema';

const meta = {
  title: 'Organization/Tabs',
  id: 'organization-tabs',
  tags: ['autodocs'],
  args: example.config,
  argTypes: controls(example.schema),
  render: renderExample(example),
  parameters: {
    docs: {
      description: { component: example.notes },
      source: { code: example.source, language: 'tsx' },
    },
  },
} satisfies Meta<PreviewArgs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Line: Story = { args: { variant: 'line' } };
export const Pills: Story = { args: { variant: 'pills' } };
export const Keyboard: Story = {
  parameters: { docs: { description: { story: example.keyboard } } },
};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Narrow: Story = { globals: { width: 'narrow' } };
export const Small: Story = { args: { size: 'sm' } };
export const Large: Story = { args: { size: 'lg' } };
export const ControlledAndUncontrolled: Story = {};
