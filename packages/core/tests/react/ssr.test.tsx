// @vitest-environment node
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { HydraOneProvider, useHydraOneContext } from '../../src/react/context';

function Probe(): React.JSX.Element {
  const { client, storage } = useHydraOneContext();
  return (
    <span>
      {client ? 'client' : 'no-client'}:{storage.constructor.name}
    </span>
  );
}

describe('HydraOneProvider under server rendering', () => {
  it('renders without window, using in-memory storage', () => {
    expect(typeof window).toBe('undefined');

    const html = renderToString(
      <HydraOneProvider appCenterOrigin="https://alpha.hydraone.app">
        <Probe />
      </HydraOneProvider>,
    );

    expect(html).toContain('client');
    expect(html).toContain('InMemoryStorageAdapter');
  });

  it('renders with an explicit transport and no origin', () => {
    const html = renderToString(
      <HydraOneProvider options={{ transport: { send: async () => {}, onMessage: () => () => {} } }}>
        <Probe />
      </HydraOneProvider>,
    );

    expect(html).toContain('client');
  });
});
