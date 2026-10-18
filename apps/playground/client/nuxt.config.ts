import wasm from 'vite-plugin-wasm';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  ssr: false,
  // @hydra-sdk/cardano-wasm (cardano-serialization-lib) imports its .wasm as an ES module.
  vite: {
    plugins: [wasm()],
    build: { target: 'esnext' },
    optimizeDeps: { exclude: ['@emurgo/cardano-serialization-lib-browser'] },
  },
  // Default dev port; NUXT_PORT (see .env.example) overrides it.
  devServer: { port: Number(process.env.NUXT_PORT) || 4101 },

  runtimeConfig: {
    public: {
      // Origin of the playground host that embeds this client (NUXT_PUBLIC_HOST_ORIGIN).
      hostOrigin: 'http://localhost:4100',
    },
  },
});
