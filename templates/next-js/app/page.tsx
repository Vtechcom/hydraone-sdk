'use client';

import React, { useEffect, useState } from 'react';
import { useWallet, useHydraAuth } from '@hydraone/sdk/react';
import { mountDevTools } from '@hydraone/sdk/simulator';

export default function Home() {
  const [isReadyToRender, setIsReadyToRender] = useState(false);
  const { isConnected, address, balanceADA, connect, disconnect } = useWallet();
  const { isAuthenticated, signIn, signOut } = useHydraAuth();

  useEffect(() => {
    async function initDevShell() {
      // In development, wrap the app in the dev host shell that mimics the HydraOne web client
      if (process.env.NODE_ENV !== 'production') {
        const { initHydraDevShell } = await import('@hydraone/sdk/simulator');
        const isEmbed = initHydraDevShell({
          projectName: '{{PROJECT_NAME}}',
          enableMockWallet: true,
          enableRealWallet: true,
        });
        if (!isEmbed) {
          // The host shell is mounted in the top-level window; the nested iframe renders the game
          return;
        }

        // Inside the iframe or standalone, the DevTools widget is still available on demand
        mountDevTools({ defaultCollapsed: true });
      }

      setIsReadyToRender(true);
    }

    initDevShell();
  }, []);

  if (!isReadyToRender) {
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', background: '#0a0a1a', color: '#f8fafc' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 2rem', background: '#090d16', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#38bdf8' }}>{'{{PROJECT_NAME}}'}</div>
        <div style={{ padding: '0.4rem 0.8rem', borderRadius: 9999, background: isConnected ? '#065f46' : '#334155', color: isConnected ? '#34d399' : '#f8fafc', fontFamily: 'monospace' }}>
          {isConnected ? address : 'Wallet not connected'}
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '1rem', padding: '2.5rem', maxWidth: 600, width: '100%' }}>
          <h2 style={{ marginTop: 0, color: '#38bdf8' }}>Next.js Cardano Web3 Starter</h2>
          <p>A Next.js game starter with <strong>@hydraone/sdk/react</strong> and the dev host shell iframe.</p>

          <div style={{ display: 'grid', gap: '0.75rem', background: '#0f172a', padding: '1rem', borderRadius: '0.5rem', margin: '1.5rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>Connection status:</span>
              <span style={{ fontWeight: 600 }}>{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>ADA balance:</span>
              <span style={{ fontWeight: 600 }}>{balanceADA || '0.000000'} ADA</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>CIP-8 session:</span>
              <span style={{ fontWeight: 600 }}>{isAuthenticated ? 'Signed in' : 'Signed out'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!isConnected ? (
              <button
                onClick={() => connect()}
                style={{ padding: '0.65rem 1.25rem', borderRadius: '0.5rem', background: '#0284c7', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Connect wallet
              </button>
            ) : (
              <button
                onClick={() => disconnect()}
                style={{ padding: '0.65rem 1.25rem', borderRadius: '0.5rem', background: '#475569', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Disconnect
              </button>
            )}

            {isConnected && !isAuthenticated && (
              <button
                onClick={() => signIn({ challenge: 'HydraOne Game Login Challenge' })}
                style={{ padding: '0.65rem 1.25rem', borderRadius: '0.5rem', background: '#10b981', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                1-click CIP-8 sign in
              </button>
            )}

            {isAuthenticated && (
              <button
                onClick={() => signOut()}
                style={{ padding: '0.65rem 1.25rem', borderRadius: '0.5rem', background: 'transparent', border: '1px solid #64748b', color: '#e2e8f0', fontWeight: 600, cursor: 'pointer' }}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
