// Validates the docs content: front matter, no duplicate H1, internal links and EN/VI parity.
// Run with: pnpm --filter @hydraone/docs check
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'content')
const locales = ['en', 'vi']
const errors = []

const walk = dir =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.md') ? [path] : []
  })

// `1.getting-started/3.quick-start.md` -> `getting-started/quick-start` (Nuxt Content drops the numeric prefixes).
const toRoute = rel =>
  rel
    .split('/')
    .map(part => part.replace(/^\d+\./, '').replace(/\.md$/, ''))
    .join('/')
    .replace(/(^|\/)index$/, '')

const slugify = text =>
  text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')

const pages = {}
for (const locale of locales) {
  const base = join(root, locale)
  pages[locale] = new Map()
  for (const file of walk(base)) {
    const rel = relative(base, file).split('\\').join('/')
    const text = readFileSync(file, 'utf8')
    const headings = new Set(
      [...text.matchAll(/^#{2,4} (.+)$/gm)].map(m => slugify(m[1]))
    )
    pages[locale].set(toRoute(rel), { rel, text, headings })
  }
}

for (const locale of locales) {
  for (const { rel, text } of pages[locale].values()) {
    const where = `${locale}/${rel}`
    const isLanding = rel === 'index.md'

    if (!isLanding) {
      const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
      if (!fm) errors.push(`${where}: missing front matter`)
      else {
        if (!/^title:/m.test(fm[1])) errors.push(`${where}: missing title`)
        if (!/^description:/m.test(fm[1])) errors.push(`${where}: missing description`)
      }
      const body = fm ? text.slice(fm[0].length) : text
      const inCode = body.replace(/```[\s\S]*?```/g, '')
      if (/^# /m.test(inCode)) errors.push(`${where}: body has an H1 (the page header already renders the title)`)
    }

    const prefix = locale === 'en' ? '' : `/${locale}`
    const bare = text.replace(/```[\s\S]*?```/g, '')
    for (const m of bare.matchAll(/\]\((\/[^)\s]*)\)|^\s*to: (\/[^\s]*)$/gm)) {
      const link = m[1] ?? m[2]
      const [pathPart, hash] = link.split('#')
      let target = pathPart
      if (locale !== 'en') {
        if (!target.startsWith(`${prefix}/`) && target !== prefix) {
          errors.push(`${where}: link ${link} is missing the ${prefix} prefix`)
          continue
        }
        target = target.slice(prefix.length)
      }
      const key = target.replace(/^\//, '').replace(/\/$/, '')
      const dest = pages[locale].get(key)
      if (!dest) errors.push(`${where}: broken link ${link}`)
      else if (hash && !dest.headings.has(hash)) errors.push(`${where}: unknown anchor ${link}`)
    }
  }
}

const en = new Set(pages.en.keys())
const vi = new Set(pages.vi.keys())
for (const r of en) if (!vi.has(r)) errors.push(`vi: missing translation for ${r}`)
for (const r of vi) if (!en.has(r)) errors.push(`vi: ${r} has no English page`)

if (errors.length) {
  console.error(errors.map(e => `- ${e}`).join('\n'))
  console.error(`\n${errors.length} problem(s) found.`)
  process.exit(1)
}
console.log(`Docs OK: ${en.size} pages per locale, links and front matter valid.`)
