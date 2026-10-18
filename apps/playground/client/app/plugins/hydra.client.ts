import { PostMessageTransport, WalletBridgeClient } from '@hydraone-sdk/core';
import { setSharedWalletBridgeClient } from '@hydraone-sdk/core/vue';

// Runs before any component so useWalletBridgeClient() picks up this client.
export default defineNuxtPlugin(() => {
  const { hostOrigin } = useRuntimeConfig().public;
  setSharedWalletBridgeClient(
    new WalletBridgeClient({
      transport: new PostMessageTransport({ appCenterOrigin: hostOrigin as string }),
    }),
  );
});
