import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#ff7a1a' } },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#ff7a1a' } },
  },
  images: ['public/favicon.svg'],
});
