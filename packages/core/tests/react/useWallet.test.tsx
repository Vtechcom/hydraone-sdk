// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { HydraOneProvider } from '../../src/react/context';
import { useWallet } from '../../src/react/useWallet';
import { WalletBridgeClient } from '../../src/core/client';
import type { ITransport } from '../../src/core/ports/transport';
import type { BridgeMessage } from '../../src/core/types';
import { addressToBech32 } from '../../src/core/wallet/address';

// CIP-19 mainnet base address; the host answers in hex, the hook exposes bech32.
const WALLET_ADDRESS =
  'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x';
const NEW_ADDRESS = addressToBech32('01' + '55'.repeat(28) + '66'.repeat(28));

class MockTransport implements ITransport {
  public sentMessages: BridgeMessage[] = [];
  public noAddress: boolean = false;
  /** What the host answers to GET_CHANGE_ADDRESS. */
  public changeAddress: string = WALLET_ADDRESS;
  private messageHandlers: Array<(msg: BridgeMessage) => void> = [];

  public async send(message: BridgeMessage): Promise<void> {
    this.sentMessages.push(message);
  }

  public onMessage(handler: (msg: BridgeMessage) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  public simulateMessage(msg: BridgeMessage): void {
    for (const h of this.messageHandlers) {
      h(msg);
    }
  }

  public async request<T = unknown>(msg: Partial<BridgeMessage>): Promise<BridgeMessage<T>> {
    if (msg.type === 'CLIENT_READY') {
      return {
        id: msg.id || 'res_1',
        type: 'HOST_ACK',
        payload: {
          appCenterVersion: '1.0.0',
          walletSupported: true,
          theme: 'dark',
          language: 'en',
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'GET_CHANGE_ADDRESS') {
      return {
        id: msg.id || 'res_change',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: this.noAddress ? null : this.changeAddress,
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'GET_BALANCE') {
      return {
        id: msg.id || 'res_3a',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: [
            { unit: 'lovelace', quantity: '7500000' },
            {
              unit: 'a0b1c2d3e4f50123456789abcdef0123456789abcdef0123456789ab4859445241',
              quantity: '5',
            },
          ],
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'GET_NETWORK_ID') {
      return {
        id: msg.id || 'res_net',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: 1,
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'SIGN_TX') {
      return {
        id: msg.id || 'res_sig',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: 'signed_tx_cbor_mock',
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'SUBMIT_TX') {
      return {
        id: msg.id || 'res_sub',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: 'tx_hash_submitted_mock',
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'SIGN_DATA') {
      return {
        id: msg.id || 'res_data',
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

    if (msg.type === 'SET_ORIENTATION') {
      return {
        id: msg.id || 'res_orient',
        type: 'RPC_RESPONSE',
        payload: { requestId: msg.id, result: { success: true } } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'TRIGGER_HAPTIC') {
      return {
        id: msg.id || 'res_haptic',
        type: 'RPC_RESPONSE',
        payload: { requestId: msg.id, result: { success: true } } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    return {
      id: msg.id || 'res_def',
      type: 'RPC_RESPONSE',
      payload: { requestId: msg.id, result: null } as any,
      timestamp: Date.now(),
      source: 'hydra-host',
    };
  }
}

describe('useWallet hook', () => {
  let transport: MockTransport;
  let client: WalletBridgeClient;

  beforeEach(() => {
    transport = new MockTransport();
    client = new WalletBridgeClient({
      transport,
      isInIframe: () => true,
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <HydraOneProvider client={client}>{children}</HydraOneProvider>
  );

  it('starts with safe defaults before connecting', () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.address).toBeNull();
    expect(result.current.language).toBeNull();
    expect(result.current.balanceADA).toBeNull();
    expect(result.current.balanceLovelace).toBeNull();
  });

  it('works outside a provider when a client option is passed', () => {
    const { result } = renderHook(() => useWallet({ client }));

    expect(result.current.client).toBe(client);
    expect(result.current.isConnected).toBe(false);
  });

  it('throws a clear error when useWallet is used outside a provider without a client', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useWallet());
    }).toThrow(
      'useWallet must be used within a <HydraOneProvider> or passed a custom client option',
    );

    spy.mockRestore();
  });

  it('connects via connect() and computes the BigInt balance from GET_BALANCE', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectionState).toBe('connected');
    expect(result.current.address).toBe(WALLET_ADDRESS);
    expect(result.current.balanceLovelace).toBe(7500000n);
    expect(result.current.balanceADA).toBe('7.5');
    expect(result.current.networkId).toBe(1);
  });

  it('leaves address null when the host has no change address', async () => {
    transport.noAddress = true;
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.address).toBeNull();
  });

  it('resets state on disconnect()', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.networkId).toBe(1);

    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.address).toBeNull();
    expect(result.current.balanceADA).toBeNull();
    expect(result.current.balanceLovelace).toBeNull();
    expect(result.current.networkId).toBeNull();
  });

  it('honors autoRefreshBalance={false} passed from HydraOneProvider', async () => {
    const customWrapper = ({ children }: { children: React.ReactNode }) => (
      <HydraOneProvider client={client} autoRefreshBalance={false}>
        {children}
      </HydraOneProvider>
    );

    const { result } = renderHook(() => useWallet(), { wrapper: customWrapper });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.address).toBe(WALLET_ADDRESS);
    // The balance must not load automatically when autoRefreshBalance = false
    expect(result.current.balanceADA).toBeNull();
    expect(result.current.balanceLovelace).toBeNull();
  });

  it('reads the change address again on ACCOUNT_CHANGED instead of trusting the payload', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    transport.changeAddress = NEW_ADDRESS;
    await act(async () => {
      transport.simulateMessage({
        id: 'evt_acc',
        type: 'ACCOUNT_CHANGED',
        payload: [WALLET_ADDRESS],
        timestamp: Date.now(),
        source: 'hydra-host',
      });
    });

    expect(result.current.address).toBe(NEW_ADDRESS);
  });

  it('falls back to the ACCOUNT_CHANGED payload when the change address query fails', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    transport.noAddress = true;
    await act(async () => {
      transport.simulateMessage({
        id: 'evt_acc',
        type: 'ACCOUNT_CHANGED',
        payload: ['not-an-address', NEW_ADDRESS],
        timestamp: Date.now(),
        source: 'hydra-host',
      });
    });
    expect(result.current.address).toBe(NEW_ADDRESS);

    await act(async () => {
      transport.simulateMessage({
        id: 'evt_acc_2',
        type: 'ACCOUNT_CHANGED',
        payload: ['not-an-address'],
        timestamp: Date.now(),
        source: 'hydra-host',
      });
    });
    expect(result.current.address).toBeNull();
  });

  it('marks the wallet connected again when ACCOUNT_CHANGED follows WALLET_DISCONNECTED', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      transport.simulateMessage({
        id: 'evt_disc',
        type: 'WALLET_DISCONNECTED',
        timestamp: Date.now(),
        source: 'hydra-host',
      });
    });
    // Only the wallet left; the bridge itself stays connected.
    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectionState).toBe('connected');
    expect(result.current.isWalletConnected).toBe(false);
    expect(result.current.address).toBeNull();

    transport.changeAddress = NEW_ADDRESS;
    await act(async () => {
      transport.simulateMessage({
        id: 'evt_acc_3',
        type: 'ACCOUNT_CHANGED',
        payload: [NEW_ADDRESS],
        timestamp: Date.now(),
        source: 'hydra-host',
      });
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectionState).toBe('connected');
    expect(result.current.address).toBe(NEW_ADDRESS);
    expect(result.current.isWalletConnected).toBe(true);
  });

  it('reads the language from the handshake', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.language).toBe('en');
  });

  it('syncs the LANGUAGE_CHANGED and THEME_CHANGED events', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      transport.simulateMessage({
        id: 'evt_language',
        type: 'LANGUAGE_CHANGED',
        payload: { language: 'vi' },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      transport.simulateMessage({
        id: 'evt_theme',
        type: 'THEME_CHANGED',
        payload: { theme: 'light' },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
    });

    expect(result.current.language).toBe('vi');
    expect(result.current.theme).toBe('light');
  });

  it('runs the RPC proxy methods (signTx, submitTx, signData, device controls)', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    const signedTx = await result.current.signTx('raw_cbor');
    expect(signedTx).toBe('signed_tx_cbor_mock');

    const signSpy = vi.spyOn(client, 'signTx');
    await result.current.signTx('raw_cbor', { partialSign: true, timeoutMs: 5000 });
    expect(signSpy).toHaveBeenCalledWith(
      'raw_cbor',
      { partialSign: true, timeoutMs: 5000 },
      undefined,
    );

    const txHash = await result.current.submitTx('signed_cbor');
    expect(txHash).toBe('tx_hash_submitted_mock');

    const signature = await result.current.signData(WALLET_ADDRESS, 'abcd');
    expect(signature.signature).toBe('cose_sign1_hex');

    await expect(result.current.setOrientation('landscape')).resolves.toBeUndefined();
    await expect(result.current.triggerHaptic('medium')).resolves.toBeUndefined();
  });

  it('removes all event listeners on unmount', () => {
    const { unmount } = renderHook(() => useWallet(), { wrapper });

    // No error on unmount
    expect(() => {
      unmount();
    }).not.toThrow();

    // Emitting an event after unmount must not crash
    expect(() => {
      transport.simulateMessage({
        id: 'evt_unmount',
        type: 'ACCOUNT_CHANGED',
        payload: ['addr1afterunmount'],
        timestamp: Date.now(),
        source: 'hydra-host',
      });
    }).not.toThrow();
  });
});

describe('useWallet autoConnect option', () => {
  const build = () => {
    const client = new WalletBridgeClient({ transport: new MockTransport() });
    const init = vi.spyOn(client, 'init').mockResolvedValue(undefined);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <HydraOneProvider client={client}>{children}</HydraOneProvider>
    );
    return { client, init, wrapper };
  };

  it('calls client.init() when autoConnect is true', () => {
    const { client, init, wrapper } = build();
    const { unmount } = renderHook(() => useWallet({ autoConnect: true }), { wrapper });

    expect(init).toHaveBeenCalledTimes(1);
    unmount();
    client.destroy();
  });

  it('does not call client.init() when autoConnect is not set', () => {
    const { client, init, wrapper } = build();
    const { unmount } = renderHook(() => useWallet(), { wrapper });

    expect(init).not.toHaveBeenCalled();
    unmount();
    client.destroy();
  });
});
