'use client';

import React from 'react';
import { HydraOneProvider } from '@hydraone/sdk/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return <HydraOneProvider>{children}</HydraOneProvider>;
}
