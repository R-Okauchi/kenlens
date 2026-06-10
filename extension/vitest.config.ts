import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        settings: {
          // fixture HTML 内の外部リソース (script/css/img) を読みに行かせない
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
          disableJavaScriptEvaluation: true,
          fetch: { disableSameOriginPolicy: false },
        },
      },
    },
    include: ['tests/**/*.test.ts'],
  },
});
