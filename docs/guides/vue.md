English | [Tiếng Việt](../vi/guides/vue.md)

# Vue and Nuxt

`@hydraone/sdk/vue` provides two composables that wrap the core client in reactive state. It requires `vue` 3.3 or later as a peer dependency.

## Composables

```ts
import { computed } from 'vue';
import { useWalletBridgeClient, useGameAuth } from '@hydraone/sdk/vue';

export function useGameSession() {
  const { isConnected, address, balanceADA, connect, disconnect, error } = useWalletBridgeClient({
    autoConnect: true,
  });
  const { isAuthenticated, signIn, signOut, isExpired } = useGameAuth();

  const label = computed(() =>
    isConnected.value ? `${address.value} (${balanceADA.value} ADA)` : 'Offline',
  );

  async function toggleLogin() {
    if (isAuthenticated.value) await signOut();
    else await signIn({ challenge: 'server-issued-nonce' });
  }

  return { label, connect, disconnect, toggleLogin, isExpired, error };
}
```

### `useWalletBridgeClient(options?)`

Refs: `connectionState`, `isConnected`, `address`, `usedAddresses`, `balanceADA`, `balanceLovelace` (`bigint`), `networkId`, `hostInfo`, `isAudioMuted`, `theme`, `error`. Also returns the `client`.

Actions: `init`, `connect`, `disconnect`, `refreshBalance`, `refreshAddress`, `signTx`, `submitTx`, `signData`, `setOrientation`, `triggerHaptic`, `requestDepositModal`, `getPlayerProfile`.

Options: any `WalletBridgeClientOptions`, plus `client`, `autoConnect`, `autoRefreshBalance`.

### `useGameAuth(options?)`

Refs: `isAuthenticated`, `jwtToken`, `address`, `claims`, `error`, and the computed `isExpired`. Also returns the `authManager`.

Actions: `signIn` (also `login`), `signOut` (also `logout`), `checkSession`.

Options: `authManager`, `client`, `autoCheckSession` (default on; checks the stored session after mount).

## Shared instances

Without options, both composables use one shared client and one shared auth manager for the whole app, created on first use with `fallbackToExtension: true` and a `SafeLocalStorageAdapter` (an in-memory one on the server). The shared client has no transport, so it works through the wallet-extension fallback only.

Inside the App Center you want a `PostMessageTransport` and the host storage relay. Create them once at startup and register them:

```ts
import {
  WalletBridgeClient,
  PostMessageTransport,
  HostStorageRelayAdapter,
  GameAuthManager,
} from '@hydraone/sdk';
import { setSharedWalletBridgeClient, setSharedGameAuthManager } from '@hydraone/sdk/vue';

export function installHydra() {
  const transport = new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' });
  const client = new WalletBridgeClient({ transport, fallbackToExtension: true });
  const storage = new HostStorageRelayAdapter({ transport });

  setSharedWalletBridgeClient(client);
  setSharedGameAuthManager(new GameAuthManager({ client, storage }));
}
```

Call `installHydra()` before any component uses the composables, for example in a Nuxt client plugin (`plugins/hydra.client.ts`) or in your app entry. Pass `null` to the setters to reset them in tests.

## Nuxt

- Run the setup in a `.client.ts` plugin, because it needs `window` and `postMessage`.
- The composables are SSR-safe: they check for `window`, register listeners only after mount, and remove them with `onScopeDispose`.
- Wrap wallet-dependent markup in `<ClientOnly>` or a `v-if` on `isConnected` so server and client markup match.

`npx create-hydraone-game my-game --template nuxt-3` generates a starter that uses the shared defaults (wallet-extension fallback only). Add the `installHydra()` setup above before embedding the game in the App Center.

## Testing

Create a `MockBridgeHost`, register `new WalletBridgeClient({ transport: host.createClientTransport() })` with `setSharedWalletBridgeClient`, and mount your component with Vue Test Utils. See [Testing your integration](../testing-your-integration.md).
