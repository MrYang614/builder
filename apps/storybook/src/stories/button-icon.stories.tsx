import type { Meta, StoryObj } from '@storybook/react-vite';
import { buttonIcon as example } from '../examples/action-definitions';
import { controls, renderExample } from './story-helpers';
import type { PreviewArgs } from '../playground/schema';

const meta = {
  title: 'Actions/Button.Icon',
  id: 'actions-button-icon',
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
export const Keyboard: Story = {
  parameters: { docs: { description: { story: example.keyboard } } },
};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Narrow: Story = { globals: { width: 'narrow' } };
export const Small: Story = { args: { size: 'sm' } };
export const Large: Story = { args: { size: 'lg' } };
export const Disabled: Story = { args: { disabled: true } };
export const Loading: Story = { args: { loading: true } };
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Outline: Story = { args: { variant: 'outline' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Destructive: Story = { args: { variant: 'destructive' } };
export const Link: Story = { args: { variant: 'link' } };
export const DangerGhost: Story = { args: { variant: 'danger-ghost' } };
