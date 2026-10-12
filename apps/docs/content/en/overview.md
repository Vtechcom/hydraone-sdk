---
title: "HydraOne SDK documentation"
---

# HydraOne SDK documentation

| Page                                                      | What it covers                                       |
| --------------------------------------------------------- | ---------------------------------------------------- |
| [Getting started](/getting-started)                   | Install, first connection, reading balances, signing |
| [Authentication](/authentication)                     | CIP-8 login and JWT session lifecycle                |
| [Configuration](/configuration)                       | Every client, transport and storage option           |
| [Error handling](/error-handling)                     | Error classes, codes and recovery patterns           |
| [Logging](/logging)                                   | Debug output and custom loggers                      |
| [Testing your integration](/testing-your-integration) | Bridge health diagnostics, release checklist         |
| [Architecture](/architecture)                         | Modes, protocol, security model, package layout      |
| [FAQ](/faq)                                           | Short answers to common questions                    |
| [Troubleshooting](/troubleshooting)                   | Symptoms, causes and fixes                           |
| [Glossary](/glossary)                                 | Terms used across the docs                           |

Guides:

- [Safari ITP and host storage](/guides/safari-itp)
- [React and Next.js](/guides/react)
- [Vue and Nuxt](/guides/vue)

## API reference

The API reference is generated from the TSDoc comments in `src/` with TypeDoc and is not committed. Build it with:

```bash
pnpm run docs:api
```

The output is written to `packages/sdk/docs/api/`. Open `docs/api/index.html` in a browser.
