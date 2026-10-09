'use client';

import React from 'react';
import { HydraOneProvider } from '@hydraone/sdk/react';
import { isEmbedded, resolveHostOrigin } from '../lib/hydra';

export function Providers({ children }: { children: React.ReactNode }) {
  // Embedded (HydraOne web client or dev shell): talk to the host over postMessage.
  // Standalone tab: the SDK falls back to a CIP-30 wallet extension.
  const embedded = isEmbedded();

  return (
    <HydraOneProvider
      appCenterOrigin={embedded ? resolveHostOrigin() : undefined}
      autoConnect={embedded}
      options={{ fallbackToExtension: true }}
    >
      {children}
    </HydraOneProvider>
  );
}
