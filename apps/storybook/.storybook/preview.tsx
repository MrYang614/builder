import type { Preview } from '@storybook/react-vite';
import '@building/ui/styles.css';
import '../src/playground/styles.css';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    // Controls share the temporary args; Storybook's optional disk-save actions are disabled.
    controls: { expanded: true, disableSaveFromUI: true },
    options: {
      storySort: {
        order: ['Overview', 'Input', 'Actions', 'Overlays', 'Organization', 'Feedback'],
      },
    },
  },
  globalTypes: {
    theme: {
      description: 'Preview theme',
      toolbar: { icon: 'paintbrush', items: ['light', 'dark'], dynamicTitle: true },
    },
    width: {
      description: 'Preview width',
      toolbar: { icon: 'sidebar', items: ['comfortable', 'narrow'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light', width: 'comfortable' },
  decorators: [
    (Story, context) => {
      document.documentElement.dataset.theme = context.globals.theme === 'dark' ? 'dark' : 'light';
      return <Story />;
    },
  ],
};
export default preview;
