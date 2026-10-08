'use client';

import React, { useEffect } from 'react';
import { useWallet, useHydraAuth } from '@hydraone/sdk/react';
import { mountDevTools } from '@hydraone/sdk/simulator';

export default function Home() {
  const { isConnected, address, shortAddress, balanceADA, connect, disconnect } = useWallet();
  const { isAuthenticated, signIn, signOut } = useHydraAuth();

  useEffect(() => {
    // Kích hoạt Floating DevTools UI widget trên localhost
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || process.env.NODE_ENV !== 'production')) {
      mountDevTools({ initialCollapsed: false });
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 2rem', background: '#090d16', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#38bdf8' }}>🎮 {{PROJECT_NAME}}</div>
        <div style={{ padding: '0.4rem 0.8rem', borderRadius: 9999, background: isConnected ? '#065f46' : '#334155', color: isConnected ? '#34d399' : '#f8fafc', fontFamily: 'monospace' }}>
          {isConnected ? shortAddress : 'Chưa kết nối ví'}
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '1rem', padding: '2.5rem', maxWidth: 600, width: '100%' }}>
          <h2 style={{ marginTop: 0, color: '#38bdf8' }}>Next.js Cardano Web3 Starter</h2>
          <p>Dự án game Next.js tích hợp sẵn <strong>@hydraone/sdk/react</strong> và DevTools Simulator.</p>

          <div style={{ display: 'grid', gap: '0.75rem', background: '#0f172a', padding: '1rem', borderRadius: '0.5rem', margin: '1.5rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>Trạng thái kết nối:</span>
              <span style={{ fontWeight: 600 }}>{isConnected ? 'Đã kết nối' : 'Ngắt kết nối'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>Số dư ADA:</span>
              <span style={{ fontWeight: 600 }}>{balanceADA || '0.000000'} ADA</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>Phiên đăng nhập CIP-8:</span>
              <span style={{ fontWeight: 600 }}>{isAuthenticated ? 'Đã đăng nhập' : 'Chưa đăng nhập'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!isConnected ? (
              <button
                onClick={() => connect()}
                style={{ padding: '0.65rem 1.25rem', borderRadius: '0.5rem', background: '#0284c7', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Kết nối Ví
              </button>
            ) : (
              <button
                onClick={() => disconnect()}
                style={{ padding: '0.65rem 1.25rem', borderRadius: '0.5rem', background: '#475569', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Ngắt kết nối
              </button>
            )}

            {isConnected && !isAuthenticated && (
              <button
                onClick={() => signIn({ challenge: 'HydraOne Game Login Challenge' })}
                style={{ padding: '0.65rem 1.25rem', borderRadius: '0.5rem', background: '#10b981', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                1-Click CIP-8 Đăng nhập
              </button>
            )}

            {isAuthenticated && (
              <button
                onClick={() => signOut()}
                style={{ padding: '0.65rem 1.25rem', borderRadius: '0.5rem', background: 'transparent', border: '1px solid #64748b', color: '#e2e8f0', fontWeight: 600, cursor: 'pointer' }}
              >
                Đăng xuất
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
