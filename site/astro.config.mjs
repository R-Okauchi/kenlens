// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  // GitHub Pages (project site): https://r-okauchi.github.io/kenlens/
  // 独自ドメインへ移行する場合は site を差し替え、base を外す。
  // 拡張側の REMOTE_CONFIG_URL (extension/lib/constants.ts) も同時に更新すること。
  site: 'https://r-okauchi.github.io',
  base: '/kenlens',
  i18n: {
    defaultLocale: 'ja',
    locales: ['ja', 'en'],
  },
});
