'use client';

import React from 'react';
import { HydraOneProvider } from '@hydraone-sdk/core/react';
import { isEmbedded, resolveHostOrigin } from '../lib/hydra';

export function Providers({ children }: { children: React.ReactNode }) {
  // The wallet lives in the HydraOne web client, so the game talks to it over postMessage.
  // Opened in a normal tab there is no host: the page loads but connect() fails with ERR_NOT_IN_IFRAME.
  const embedded = isEmbedded();

  return (
    <HydraOneProvider
      appCenterOrigin={resolveHostOrigin()}
      autoConnect={embedded}
    >
      {children}
    </HydraOneProvider>
  );
}
