# Playground

Local apps for testing `@hydraone-sdk/core` and `@hydraone-sdk/host` while developing the SDK. Not published.

| App       | Port | Uses                                                                                     |
| --------- | ---- | ---------------------------------------------------------------------------------------- |
| `host/`   | 4100 | `@hydraone-sdk/host` backed by a CIP-30 extension wallet, embeds the client in an iframe |
| `client/` | 4101 | `@hydraone-sdk/core` + `@hydraone-sdk/core/vue`, one button per client API               |

```sh
pnpm dev:playground
```

This builds core and host once, then runs `tsup --watch` for both SDK packages alongside the two Nuxt apps.
Open http://localhost:4100. Edits under `packages/*/src` rebuild `dist/` and the apps reload.

The host uses a real CIP-30 browser extension (Eternl is listed first; any installed CIP-30 wallet works).
Switch the extension to **Preprod** before testing: signing and submitting go to the real wallet and network.
Account and network switches in the extension are picked up by polling every 3 seconds (three failed polls in a row disconnect the wallet). The host panel also
flips theme/audio and logs every message exchanged with the client. The two apps run on different ports, so the bridge is
exercised cross-origin as in production.

## Configuration

Each app reads an optional `.env` next to its `nuxt.config.ts`. Copy the example to start:

```sh
cp host/.env.example host/.env
cp client/.env.example client/.env
```

| App    | Variable                  | Default                 | Purpose                                                          |
| ------ | ------------------------- | ----------------------- | ---------------------------------------------------------------- |
| host   | `NUXT_PUBLIC_CLIENT_URL`  | `http://localhost:4101` | Client loaded in the iframe and the only origin the host accepts |
| host   | `NUXT_PORT`               | `4100`                  | Dev server port                                                  |
| client | `NUXT_PUBLIC_HOST_ORIGIN` | `http://localhost:4100` | Origin the SDK trusts for postMessage traffic                    |
| client | `NUXT_PORT`               | `4101`                  | Dev server port                                                  |

When changing a port, update the matching URL in the other app as well.
