const hostOrigin = process.env.NUXT_PUBLIC_HYDRA_HOST_ORIGIN || 'https://alpha.hydraone.app';

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: false },
  ssr: true,

  runtimeConfig: {
    public: {
      // Origin of the HydraOne web client that embeds the deployed game (NUXT_PUBLIC_HYDRA_HOST_ORIGIN).
      hydraHostOrigin: hostOrigin,
    },
  },

  // Let the HydraOne web client (and localhost during development) embed this game in an iframe.
  routeRules: {
    '/**': {
      headers: {
        'Content-Security-Policy': `frame-ancestors 'self' ${hostOrigin} http://localhost:* http://127.0.0.1:*`,
      },
    },
  },
});
