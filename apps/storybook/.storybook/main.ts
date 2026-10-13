import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: { builder: { viteConfigPath: 'vite.config.ts' } },
  },
  core: { disableTelemetry: true },
  // The optional review UI persists return URLs including temporary args in sessionStorage.
  features: { experimentalReview: false },
  // Namespace and option APIs are documented explicitly by the schema and props table.
  typescript: { reactDocgen: false },
};
export default config;
