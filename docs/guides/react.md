English | [Tiếng Việt](../vi/guides/react.md)

# React and Next.js

`@hydraone/sdk/react` provides a provider and three hooks on top of the core client. It requires `react` 18 or later as a peer dependency.

## Provider

Wrap your app once. The provider creates a `WalletBridgeClient`, a `GameAuthManager` and a storage adapter, and keeps them stable across renders.

```tsx
import React from 'react';
import { HydraOneProvider, useWallet, useHydraAuth } from '@hydraone/sdk/react';

function Game() {
  const { isConnected, address, balanceADA, connect, disconnect } = useWallet();
  const { isAuthenticated, signIn, signOut, error } = useHydraAuth();

  return (
    <div>
      <p>{isConnected ? `${address} (${balanceADA} ADA)` : 'Not connected'}</p>
      <button onClick={() => (isConnected ? disconnect() : connect())}>
        {isConnected ? 'Disconnect' : 'Connect'}
      </button>
      <button
        onClick={() => (isAuthenticated ? signOut() : signIn({ challenge: 'server-issued-nonce' }))}
      >
        {isAuthenticated ? 'Sign out' : 'Sign in'}
      </button>
      {error && <p role="alert">{error.message}</p>}
    </div>
  );
}

export function App() {
  return (
    <HydraOneProvider appCenterOrigin="https://alpha.hydraone.app" autoConnect>
      <Game />
    </HydraOneProvider>
  );
}
```

Props: `client`, `authManager`, `storage`, `appCenterOrigin`, `options`, `autoConnect`, `autoRefreshBalance`. See [Configuration](../configuration.md#react-provider).

Defaults worth knowing:

- With `appCenterOrigin`, the provider creates a `PostMessageTransport`. Without it (and without `options.transport`) the client has no transport, so it works only through the wallet-extension fallback.
- `fallbackToExtension` is `true` by default in the provider.
- The default storage is `SafeLocalStorageAdapter` in the browser and `InMemoryStorageAdapter` on the server.
- `autoConnect` calls `client.init()` in an effect, so it never runs during server rendering.

## Use the host storage relay

To keep the session alive on Safari, pass a `HostStorageRelayAdapter` that shares the transport with the client:

```tsx
import React from 'react';
import { PostMessageTransport, HostStorageRelayAdapter } from '@hydraone/sdk';
import { HydraOneProvider, useWallet } from '@hydraone/sdk/react';

const transport = new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' });
const storage = new HostStorageRelayAdapter({ transport });

function Balance() {
  const { balanceADA, isConnected } = useWallet();
  return <p>{isConnected ? `${balanceADA} ADA` : 'Not connected'}</p>;
}

export function App() {
  return (
    <HydraOneProvider options={{ transport }} storage={storage} autoConnect>
      <Balance />
    </HydraOneProvider>
  );
}
```

## Hooks

### `useWallet(options?)`

Returns reactive wallet state and actions.

State: `client`, `connectionState`, `isConnected`, `address`, `usedAddresses`, `balanceADA` (string or `null`), `balanceLovelace` (`bigint` or `null`), `networkId`, `hostInfo`, `isAudioMuted`, `theme`.

Actions: `connect`, `disconnect`, `refreshBalance`, `signTx`, `submitTx`, `signData`, `setOrientation`, `triggerHaptic`, `requestDepositModal`, `getPlayerProfile`.

Options: `client`, `autoConnect`, `autoRefreshBalance` (default `true`).

### `useHydraAuth(options?)`

State: `authManager`, `authState`, `isAuthenticated`, `token` (also `jwtToken`), `address`, `claims` (also `user`), `isExpired`, `isAuthenticating`, `error`.

Actions: `signIn` (also `login`), `signOut` (also `logout`), `checkSession` (also `refreshSession`).

Options: `authManager`, `client`, `storage`. The hook throws if it is used without a provider and without an `authManager` or `client` option.

### `useHostStorage(options?)`

Returns `storage`, `isAvailable`, `getItem`, `setItem`, `removeItem`, `clear`. It uses the provider's storage unless you pass `storage`.

### `useHydraOneContext()`

Returns `{ client, authManager, storage, autoRefreshBalance }`. It throws a clear error when used outside `<HydraOneProvider>`.

## Next.js (App Center router)

The hooks use browser APIs, so use them in client components. Create the provider in a client component and render it from your layout:

```tsx
'use client';

import React, { useMemo } from 'react';
import { PostMessageTransport, HostStorageRelayAdapter } from '@hydraone/sdk';
import { HydraOneProvider } from '@hydraone/sdk/react';

export function Providers({ children }: { children: React.ReactNode }) {
  const { transport, storage } = useMemo(() => {
    const t = new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' });
    return { transport: t, storage: new HostStorageRelayAdapter({ transport: t }) };
  }, []);

  return (
    <HydraOneProvider options={{ transport }} storage={storage}>
      {children}
    </HydraOneProvider>
  );
}
```

Server rendering is safe: nothing touches `window` until an effect runs. Balances and addresses are empty on the server and fill in after the client connects, so render a neutral state first to avoid hydration mismatches.

`npx create-hydraone-game my-game --template next-js` generates a starter with a client-component `Providers` wrapper. It uses a bare `<HydraOneProvider>` (wallet-extension fallback only), so add `appCenterOrigin` or the transport and relay setup above before embedding the game in the App Center.

## Testing

Use the [simulator](../testing-your-integration.md): create a `MockBridgeHost`, pass `host.createClientTransport()` through `options.transport`, and render your components with `@testing-library/react`.
