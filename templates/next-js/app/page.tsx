'use client';

import React, { useEffect, useState } from 'react';
import { useWallet, useHydraAuth } from '@hydraone/sdk/react';
import type { BridgeHealthReport } from '@hydraone/sdk';
import { bootstrapDevShell, isEmbedded } from '../lib/hydra';

const PROJECT_NAME = '{{PROJECT_NAME}}';

const buttonBase: React.CSSProperties = {
  padding: '0.65rem 1.25rem',
  borderRadius: '0.5rem',
  border: 'none',
  fontWeight: 600,
  cursor: 'pointer',
  color: 'white',
};

export default function Home() {
  const [isReadyToRender, setIsReadyToRender] = useState(false);
  const [health, setHealth] = useState<BridgeHealthReport | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const { client, isConnected, address, balanceADA, connect, disconnect } = useWallet();
  const { isAuthenticated, signIn, signOut } = useHydraAuth();

  useEffect(() => {
    // Development only: opened in a top-level tab, this wraps the game in the HydraOne
    // host UI and renders the game inside its iframe. Production builds skip it entirely.
    bootstrapDevShell(PROJECT_NAME).then(setIsReadyToRender);
  }, []);

  if (!isReadyToRender) {
    return null;
  }

  const embedded = isEmbedded();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, system-ui, sans-serif', background: '#0a0a1a', color: '#f8fafc' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: '#090d16', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#38bdf8' }}>{PROJECT_NAME}</div>
        <div style={{ padding: '0.4rem 0.8rem', borderRadius: 9999, background: isConnected ? '#065f46' : '#334155', color: isConnected ? '#34d399' : '#f8fafc', fontFamily: 'monospace', fontSize: '0.8rem' }}>
          {isConnected ? address : 'Wallet not connected'}
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1.5rem' }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '1rem', padding: '2rem', maxWidth: 600, width: '100%' }}>
          <h2 style={{ marginTop: 0, color: '#38bdf8' }}>Next.js Cardano Web3 Starter</h2>
          <p>
            Deploy this app anywhere and register its URL in the HydraOne web client. It runs as
            an embedded game with the wallet provided by the host.
          </p>

          <div style={{ display: 'grid', gap: '0.75rem', background: '#0f172a', padding: '1rem', borderRadius: '0.5rem', margin: '1.5rem 0' }}>
            <Row label="Mode" value={embedded ? 'Embedded in host' : 'Standalone tab'} />
            <Row label="Connection status" value={isConnected ? 'Connected' : 'Disconnected'} />
            <Row label="ADA balance" value={`${balanceADA || '0.000000'} ADA`} />
            <Row label="CIP-8 session" value={isAuthenticated ? 'Signed in' : 'Signed out'} />
          </div>

          {error && (
            <p role="alert" style={{ color: '#f87171', fontSize: '0.875rem' }}>
              {error.message}
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!isConnected ? (
              <button onClick={() => connect().then(() => setError(null), setError)} style={{ ...buttonBase, background: '#0284c7' }}>
                Connect wallet
              </button>
            ) : (
              <button onClick={() => disconnect()} style={{ ...buttonBase, background: '#475569' }}>
                Disconnect
              </button>
            )}

            {isConnected && !isAuthenticated && (
              <button
                onClick={() => signIn({ challenge: 'HydraOne Game Login Challenge' }).then(() => setError(null), setError)}
                style={{ ...buttonBase, background: '#10b981' }}
              >
                1-click CIP-8 sign in
              </button>
            )}

            {isAuthenticated && (
              <button onClick={() => signOut()} style={{ ...buttonBase, background: 'transparent', border: '1px solid #64748b', color: '#e2e8f0' }}>
                Sign out
              </button>
            )}

            <button
              onClick={() => client.checkHealth().then(setHealth).catch(() => {})}
              style={{ ...buttonBase, background: 'transparent', border: '1px solid #64748b', color: '#e2e8f0' }}
            >
              Check host bridge
            </button>
          </div>

          {health && (
            <pre style={{ marginTop: '1rem', padding: '0.75rem', background: '#0f172a', borderRadius: '0.5rem', fontSize: '0.75rem', overflowX: 'auto' }}>
              {health.status}: {health.summary}
              {health.checks.map((c) => `\n  [${c.status}] ${c.name}: ${c.message}`).join('')}
            </pre>
          )}
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#94a3b8' }}>{label}:</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
