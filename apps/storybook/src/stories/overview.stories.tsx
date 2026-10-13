import { Alert, Badge, Button, Card } from '@building/ui';
import type { Meta, StoryObj } from '@storybook/react-vite';

const groups = [
  {
    title: 'Input and selection',
    prefix: 'input',
    families: [
      ['Input', 'input'],
      ['Input.TextArea', 'input-text-area'],
      ['Input.Password', 'input-password'],
      ['Input.Search', 'input-search'],
      ['InputNumber', 'input-number'],
      ['Select', 'select'],
      ['Checkbox', 'checkbox'],
      ['Checkbox.Group', 'checkbox-group'],
      ['Radio', 'radio'],
      ['Radio.Group', 'radio-group'],
      ['Switch', 'switch'],
      ['Slider', 'slider'],
    ],
  },
  {
    title: 'Actions and form',
    prefix: 'actions',
    families: [
      ['Button', 'button'],
      ['Button.Icon', 'button-icon'],
      ['Button.Group', 'button-group'],
      ['Form', 'form'],
    ],
  },
  {
    title: 'Overlays',
    prefix: 'overlays',
    families: [
      ['Tooltip', 'tooltip'],
      ['Popover', 'popover'],
      ['DropdownMenu', 'dropdown-menu'],
      ['ContextMenu', 'context-menu'],
      ['Dialog', 'dialog'],
      ['ConfirmDialog', 'confirm-dialog'],
    ],
  },
  {
    title: 'Organization',
    prefix: 'organization',
    families: [
      ['Tabs', 'tabs'],
      ['Segmented', 'segmented'],
      ['Toggle', 'toggle'],
      ['ToggleGroup', 'toggle-group'],
      ['Accordion', 'accordion'],
    ],
  },
  {
    title: 'Feedback and display',
    prefix: 'feedback',
    families: [
      ['Alert', 'alert'],
      ['Badge', 'badge'],
      ['Card', 'card'],
      ['Separator', 'separator'],
      ['Empty', 'empty'],
      ['Skeleton', 'skeleton'],
      ['Spinner', 'spinner'],
      ['Progress', 'progress'],
    ],
  },
];

function Overview() {
  return (
    <main className="overview">
      <h1>Building UI component workshop</h1>
      <p>
        The editor and this workshop consume the same @building/ui components. Choose a family to
        test real interactions, edit TSX and JSON configuration, inspect props, and copy working
        usage code.
      </p>
      <div className="example-row">
        <Badge variant="outline">35 component entries</Badge>
        <Badge variant="success">Shared implementation</Badge>
        <Button
          variant="outline"
          onClick={() => {
            document.documentElement.dataset.theme =
              document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
          }}
        >
          Toggle theme / 切换主题
        </Button>
      </div>
      <div className="overview-grid">
        {groups.map((group) => (
          <section className="overview-group" key={group.title}>
            <h2>{group.title}</h2>
            <ul>
              {group.families.map(([label, id]) => (
                <li key={id}>
                  <a href={`/?path=/story/${group.prefix}-${id}--default`} target="_top">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Card
        title="Two editing workflows"
        description="Browser drafts stay in memory; local files remain the baseline."
      >
        <p>
          Browser TSX uses React hooks, @building/ui public exports and documented lucide-react
          icons. JSON edits share args with Storybook Controls. Local component changes refresh the
          current preview; local example/config changes update the reset baseline while preserving
          active drafts.
        </p>
      </Card>
      <Alert
        title="Keyboard and responsive review"
        description="Each family includes keyboard guidance, light/dark previews and a narrow-container story. Disabled, readOnly, pending and error states appear where they apply."
      />
    </main>
  );
}

const meta = {
  title: 'Overview/Component directory',
  id: 'overview-component-directory',
  render: Overview,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Directory: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
