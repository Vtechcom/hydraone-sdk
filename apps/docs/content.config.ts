import { defineContentConfig, defineCollection, z } from '@nuxt/content'

// Keep in sync with the `i18n.locales` codes in nuxt.config.ts
const locales = ['en', 'vi'] as const

const docsSchema = z.object({
  // Required so every page carries its own summary; the page header renders it under the title.
  description: z.string().min(1),
  links: z.array(z.object({
    label: z.string(),
    icon: z.string(),
    to: z.string(),
    target: z.string().optional()
  })).optional()
})

// One `landing_<locale>` + `docs_<locale>` collection per language.
// `prefix: ''` strips the locale folder, so `content/vi/getting-started.md`
// and `content/en/getting-started.md` both resolve to `/getting-started`.
function localizedCollections() {
  return Object.fromEntries(
    locales.flatMap(locale => [
      [`landing_${locale}`, defineCollection({
        type: 'page',
        source: { include: `${locale}/index.md`, prefix: '' }
      })],
      [`docs_${locale}`, defineCollection({
        type: 'page',
        source: { include: `${locale}/**`, exclude: [`${locale}/index.md`], prefix: '' },
        schema: docsSchema
      })]
    ])
  )
}

export default defineContentConfig({
  collections: localizedCollections()
})
