// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { HydraOneProvider } from '../../src/react/context';
import { useWallet } from '../../src/react/useWallet';
import { WalletBridgeClient } from '../../src/core/client';
import type { ITransport } from '../../src/core/ports/transport';
import type { BridgeMessage } from '../../src/core/types';

class MockTransport implements ITransport {
  public sentMessages: BridgeMessage[] = [];
  public returnEmptyUsedAddresses: boolean = false;
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
          audioMuted: false,
        } as any,
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
          result: this.returnEmptyUsedAddresses
            ? []
            : [
                'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x',
              ],
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
          result: 'addr1qchangeaddress99999999999999999999999999999999999999999999999999999999999999',
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'GET_UTXOS') {
      return {
        id: msg.id || 'res_3',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: [
            {
              txHash: 'a'.repeat(64),
              index: 0,
              amount: [{ unit: 'lovelace', quantity: '5000000' }],
            },
            {
              txHash: 'b'.repeat(64),
              index: 1,
              amount: [{ unit: 'lovelace', quantity: '2500000' }],
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

    if (msg.type === 'REQUEST_DEPOSIT_MODAL') {
      return {
        id: msg.id || 'res_modal',
        type: 'RPC_RESPONSE',
        payload: { requestId: msg.id, result: { success: true } } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'GET_PLAYER_PROFILE') {
      return {
        id: msg.id || 'res_profile',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: {
            nickname: 'CardanoGamer',
            avatarUrl: 'https://example.com/avatar.png',
            vipLevel: 3,
            adaHandle: '$cardanogamer',
          },
        } as any,
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
      isIframeFn: () => true,
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
    expect(result.current.usedAddresses).toEqual([]);
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
    }).toThrow('useWallet must be used within a <HydraOneProvider> or passed a custom client option');

    spy.mockRestore();
  });


  it('connects via connect() and computes the BigInt balance', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectionState).toBe('connected');
    expect(result.current.address).toBe(
      'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x'
    );
    expect(result.current.balanceLovelace).toBe(7500000n);
    expect(result.current.balanceADA).toBe('7.5');
    expect(result.current.networkId).toBe(1);
  });

  it('falls back to getChangeAddress when usedAddresses is empty', async () => {
    transport.returnEmptyUsedAddresses = true;
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.address).toBe(
      'addr1qchangeaddress99999999999999999999999999999999999999999999999999999999999999'
    );
    expect(result.current.usedAddresses).toEqual([
      'addr1qchangeaddress99999999999999999999999999999999999999999999999999999999999999',
    ]);
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
    expect(result.current.address).toBe(
      'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x'
    );
    // The balance must not load automatically when autoRefreshBalance = false
    expect(result.current.balanceADA).toBeNull();
    expect(result.current.balanceLovelace).toBeNull();
  });

  it('syncs the ACCOUNT_CHANGED event from a host message', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    const newAddr = 'addr1qnewaccount88888888888888888888888888888888888888888888888888888888888888';
    await act(async () => {
      transport.simulateMessage({
        id: 'evt_acc',
        type: 'ACCOUNT_CHANGED',
        payload: [newAddr],
        timestamp: Date.now(),
        source: 'hydra-host',
      });
    });

    expect(result.current.address).toBe(newAddr);
    expect(result.current.usedAddresses).toEqual([newAddr]);
  });

  it('syncs the AUDIO_MUTED_CHANGED and THEME_CHANGED events', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      transport.simulateMessage({
        id: 'evt_audio',
        type: 'AUDIO_MUTED_CHANGED',
        payload: { muted: true },
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

    expect(result.current.isAudioMuted).toBe(true);
    expect(result.current.theme).toBe('light');
  });

  it('runs the RPC proxy methods (signTx, submitTx, signData, device controls, profile)', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    const signedTx = await result.current.signTx('raw_cbor');
    expect(signedTx).toBe('signed_tx_cbor_mock');

    const txHash = await result.current.submitTx('signed_cbor');
    expect(txHash).toBe('tx_hash_submitted_mock');

    const signature = await result.current.signData('addr1...', 'hex_payload');
    expect(signature.signature).toBe('cose_sign1_hex');

    await expect(result.current.setOrientation('landscape')).resolves.toBeUndefined();
    await expect(result.current.triggerHaptic('medium')).resolves.toBeUndefined();
    await expect(result.current.requestDepositModal()).resolves.toBeUndefined();

    const profile = await result.current.getPlayerProfile();
    expect(profile.nickname).toBe('CardanoGamer');
    expect(profile.adaHandle).toBe('$cardanogamer');
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
