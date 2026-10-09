English | [Tiếng Việt](./vi/README.md)

# HydraOne SDK documentation

| Page                                                      | What it covers                                       |
| --------------------------------------------------------- | ---------------------------------------------------- |
| [Getting started](./getting-started.md)                   | Install, first connection, reading balances, signing |
| [Authentication](./authentication.md)                     | CIP-8 login and JWT session lifecycle                |
| [Configuration](./configuration.md)                       | Every client, transport and storage option           |
| [Error handling](./error-handling.md)                     | Error classes, codes and recovery patterns           |
| [Logging](./logging.md)                                   | Debug output and custom loggers                      |
| [Testing your integration](./testing-your-integration.md) | Mock host, DevTools widget, dev shell, diagnostics   |
| [Architecture](./architecture.md)                         | Modes, protocol, security model, package layout      |
| [FAQ](./faq.md)                                           | Short answers to common questions                    |
| [Troubleshooting](./troubleshooting.md)                   | Symptoms, causes and fixes                           |
| [Glossary](./glossary.md)                                 | Terms used across the docs                           |

Guides:

- [Safari ITP and host storage](./guides/safari-itp.md)
- [React and Next.js](./guides/react.md)
- [Vue and Nuxt](./guides/vue.md)

## API reference

The API reference is generated from the TSDoc comments in `src/` with TypeDoc and is not committed. Build it with:

```bash
pnpm run docs
```

The output is written to `docs/api/`. Open `docs/api/index.html` in a browser.
