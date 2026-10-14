// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { HydraOneProvider } from '../../src/react/context';
import { useHydraAuth } from '../../src/react/useHydraAuth';
import { WalletBridgeClient } from '../../src/core/client';
import { GameAuthManager } from '../../src/core/auth';
import type { ITransport } from '../../src/core/ports/transport';
import type { BridgeMessage } from '../../src/core/types';
import { InMemoryStorageAdapter } from '../../src/core/adapters/storage';

class MockTransport implements ITransport {
  public shouldRejectSignData: boolean = false;

  public async send(_msg: BridgeMessage): Promise<void> {}

  public onMessage(_handler: (msg: BridgeMessage) => void): () => void {
    return () => {};
  }

  public async request<T = unknown>(msg: Partial<BridgeMessage>): Promise<BridgeMessage<T>> {
    if (msg.type === 'CLIENT_READY') {
      return {
        id: msg.id || 'res_1',
        type: 'HOST_ACK',
        payload: { appCenterVersion: '1.0.0', walletSupported: true } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'GET_USED_ADDRESSES') {
      return {
        id: msg.id || 'res_2',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: [
            'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x',
          ],
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'SIGN_DATA') {
      if (this.shouldRejectSignData) {
        throw new Error('User rejected signing authentication challenge');
      }

      return {
        id: msg.id || 'res_sig',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: {
            signature: 'cose_sign1_hex',
            key: 'cose_key_hex',
          },
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    return {
      id: msg.id || 'res_def',
      type: 'RPC_RESPONSE',
      payload: {} as any,
      timestamp: Date.now(),
      source: 'hydra-host',
    };
  }
}

// Build a valid, unexpired JWT (exp = now + 3600s)
function createMockJwt(payload: Record<string, any> = {}): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const claims = {
    sub: 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    ...payload,
  };
  const b64Header = btoa(JSON.stringify(header));
  const b64Claims = btoa(JSON.stringify(claims));
  return `${b64Header}.${b64Claims}.mock_signature`;
}

describe('useHydraAuth hook', () => {
  let transport: MockTransport;
  let client: WalletBridgeClient;
  let storage: InMemoryStorageAdapter;
  let authManager: GameAuthManager;

  beforeEach(async () => {
    transport = new MockTransport();
    client = new WalletBridgeClient({
      transport,
      isIframeFn: () => true,
    });
    await client.init();
    storage = new InMemoryStorageAdapter();
    authManager = new GameAuthManager({
      client,
      storage,
      exchangeToken: async () => createMockJwt({ role: 'player' }),
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <HydraOneProvider client={client} authManager={authManager} storage={storage}>
      {children}
    </HydraOneProvider>
  );

  it('starts in the default unauthenticated state', () => {
    const { result } = renderHook(() => useHydraAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(result.current.jwtToken).toBeNull();
    expect(result.current.address).toBeNull();
    expect(result.current.claims).toBeNull();
    expect(result.current.isExpired).toBe(true);
    expect(result.current.isAuthenticating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('works outside a provider when an authManager option is passed', () => {
    const { result } = renderHook(() => useHydraAuth({ authManager }));

    expect(result.current.authManager).toBe(authManager);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('throws a clear error when useHydraAuth is used outside a provider without an authManager/client', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useHydraAuth());
    }).toThrow(
      'useHydraAuth must be used within a <HydraOneProvider> or passed an authManager/client option',
    );

    spy.mockRestore();
  });

  it('signs in via signIn() and updates token, address and claims', async () => {
    const { result } = renderHook(() => useHydraAuth(), { wrapper });

    await act(async () => {
      await result.current.signIn({
        challenge: 'auth_challenge_nonce_123',
      });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBeTruthy();
    expect(result.current.jwtToken).toBe(result.current.token);
    expect(result.current.address).toBe(
      'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x',
    );
    expect(result.current.claims?.role).toBe('player');
    expect(result.current.user?.role).toBe('player');
    expect(result.current.isExpired).toBe(false);
    expect(result.current.isAuthenticating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('signs out and clears the session via signOut()', async () => {
    const { result } = renderHook(() => useHydraAuth(), { wrapper });

    await act(async () => {
      await result.current.signIn({ challenge: 'nonce_123' });
    });
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(result.current.address).toBeNull();
    expect(result.current.claims).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.isExpired).toBe(true);
  });

  it('stores and rethrows the error when signIn() fails because the user rejected, then clears it after a successful retry', async () => {
    transport.shouldRejectSignData = true;
    const { result } = renderHook(() => useHydraAuth(), { wrapper });

    let caughtError: any = null;
    await act(async () => {
      try {
        await result.current.signIn({ challenge: 'nonce_fail' });
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError).toBeTruthy();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(result.current.isAuthenticating).toBe(false);

    // Retry once the user agrees to sign
    transport.shouldRejectSignData = false;
    await act(async () => {
      await result.current.signIn({ challenge: 'nonce_retry_success' });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('removes event listeners on unmount', () => {
    const { unmount } = renderHook(() => useHydraAuth(), { wrapper });

    expect(() => {
      unmount();
    }).not.toThrow();
  });
});
