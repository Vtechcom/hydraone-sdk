// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxt/content',
    '@nuxtjs/i18n',
    'nuxt-og-image',
    'nuxt-llms',
    '@nuxtjs/mcp-toolkit'
  ],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  site: { url: 'https://alpha.hydraone.app' },

  colorMode: { preference: 'dark' },

  content: {
    build: {
      markdown: {
        toc: { searchDepth: 1 }
      }
    },
    experimental: {
      // Node's built-in `node:sqlite` (Node >= 22); avoids better-sqlite3.
      sqliteConnector: 'native'
    }
  },

  // Default dev port for the docs site; `nuxt dev --port <n>` or NUXT_PORT still override it.
  devServer: { port: 3002 },

  experimental: { asyncContext: true },

  compatibilityDate: '2026-06-30',

  nitro: {
    prerender: {
      routes: ['/'],
      crawlLinks: true
    }
  },

  vite: {
    optimizeDeps: { include: ['animejs', 'mermaid'] }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // Keep locale codes in sync with the collections in content.config.ts
  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale: 'en',
    locales: [
      { code: 'en', name: 'English', language: 'en-US' },
      { code: 'vi', name: 'Tiếng Việt', language: 'vi-VN' }
    ],
    detectBrowserLanguage: false
  },

  llms: {
    domain: 'https://alpha.hydraone.app',
    title: 'HydraOne SDK',
    description: 'Official SDK for building HydraOne games and dApps on Cardano: wallet bridge, CIP-8 auth and React/Vue adapters.',
    // Locale-aware handler lives in server/routes/raw/.
    contentRawMarkdown: false,
    full: {
      title: 'HydraOne SDK - Full Documentation',
      description: 'The complete documentation for HydraOne SDK.'
    },
    sections: [
      {
        title: 'Documentation',
        contentCollection: 'docs_en',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '/%' }
        ]
      }
    ]
  },

  mcp: { name: 'HydraOne SDK' },

  ogImage: { zeroRuntime: true }
})
