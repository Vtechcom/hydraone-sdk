import wasm from 'vite-plugin-wasm';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  app: {
    head: {
      title: 'Playground Host · HydraOne',
      link: [{ rel: 'icon', href: '/favicon.ico' }],
    },
  },
  // The bridge only runs in the browser (window, postMessage, iframes).
  ssr: false,
  // @hydra-sdk/cardano-wasm (cardano-serialization-lib) imports its .wasm as an ES module.
  vite: {
    plugins: [wasm()],
    build: { target: 'esnext' },
    optimizeDeps: { exclude: ['@emurgo/cardano-serialization-lib-browser'] },
  },
  // Default dev port; NUXT_PORT (see .env.example) overrides it.
  devServer: { port: Number(process.env.NUXT_PORT) || 4100 },

  runtimeConfig: {
    public: {
      // URL of the playground client loaded in the iframe (NUXT_PUBLIC_CLIENT_URL).
      clientUrl: 'http://localhost:4101',
    },
  },
});
