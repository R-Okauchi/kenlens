import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// 権限は最小に保つ (ExCITATION の *://*/* 批判への差別化であり、CWS 審査要件でもある)。
// 各 host_permission の正当化文は docs/store-listing.md に対応必須。
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  zip: {
    // 実在研究者ページのスナップショット/スクショは配布物に含めない (再配布禁止の自主方針)
    excludeSources: ['tests/fixtures/**', 'e2e/shots/**'],
  },
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'ja',
    permissions: ['storage', 'alarms'],
    host_permissions: [
      'https://api.researchmap.jp/*',
      'https://api.openalex.org/*',
      'https://api.crossref.org/*',
      'https://api.unpaywall.org/*',
    ],
  },
});
