// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  HydraOneProvider,
  useHydraOneContext,
  useHydraOne,
} from '../../src/react/context';
import { WalletBridgeClient } from '../../src/core/client';
import { GameAuthManager } from '../../src/core/auth';
import type { ITransport } from '../../src/core/ports/transport';
import type { BridgeMessage } from '../../src/core/types';
import { InMemoryStorageAdapter } from '../../src/core/adapters/storage';

class MockTransport implements ITransport {
  public sentMessages: BridgeMessage[] = [];
  public async send(message: BridgeMessage): Promise<void> {
    this.sentMessages.push(message);
  }
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
    return {
      id: msg.id || 'res_default',
      type: 'RPC_RESPONSE',
      payload: {} as any,
      timestamp: Date.now(),
      source: 'hydra-host',
    };
  }
}

function ConsumerComponent(): React.JSX.Element {
  const { client, authManager, storage } = useHydraOneContext();
  return (
    <div>
      <span data-testid="client-exists">{client ? 'yes' : 'no'}</span>
      <span data-testid="auth-exists">{authManager ? 'yes' : 'no'}</span>
      <span data-testid="storage-exists">{storage ? 'yes' : 'no'}</span>
    </div>
  );
}

function AliasConsumerComponent(): React.JSX.Element {
  const { client } = useHydraOne();
  return <span data-testid="alias-client">{client ? 'yes' : 'no'}</span>;
}

describe('HydraOneProvider and Context', () => {
  it('cung cấp client, authManager và storage cho các component con', () => {
    render(
      <HydraOneProvider appCenterOrigin="https://alpha.hydraone.app">
        <ConsumerComponent />
      </HydraOneProvider>
    );

    expect(screen.getByTestId('client-exists').textContent).toBe('yes');
    expect(screen.getByTestId('auth-exists').textContent).toBe('yes');
    expect(screen.getByTestId('storage-exists').textContent).toBe('yes');
  });

  it('hỗ trợ alias useHydraOne', () => {
    render(
      <HydraOneProvider appCenterOrigin="https://alpha.hydraone.app">
        <AliasConsumerComponent />
      </HydraOneProvider>
    );

    expect(screen.getByTestId('alias-client').textContent).toBe('yes');
  });

  it('nhận và sử dụng custom client, authManager và storage được truyền vào props', () => {
    const transport = new MockTransport();
    const customClient = new WalletBridgeClient({ transport });
    const customStorage = new InMemoryStorageAdapter();
    const customAuth = new GameAuthManager({
      client: customClient,
      storage: customStorage,
    });

    function CustomInspector() {
      const { client, authManager, storage } = useHydraOneContext();
      return (
        <div>
          <span data-testid="is-same-client">{client === customClient ? 'true' : 'false'}</span>
          <span data-testid="is-same-auth">{authManager === customAuth ? 'true' : 'false'}</span>
          <span data-testid="is-same-storage">{storage === customStorage ? 'true' : 'false'}</span>
        </div>
      );
    }

    render(
      <HydraOneProvider
        client={customClient}
        authManager={customAuth}
        storage={customStorage}
      >
        <CustomInspector />
      </HydraOneProvider>
    );

    expect(screen.getByTestId('is-same-client').textContent).toBe('true');
    expect(screen.getByTestId('is-same-auth').textContent).toBe('true');
    expect(screen.getByTestId('is-same-storage').textContent).toBe('true');
  });

  it('ném lỗi rõ ràng khi gọi useHydraOneContext bên ngoài HydraOneProvider', () => {
    // Tắt console.error tạm thời để tránh làm bẩn test logs khi React log caught error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<ConsumerComponent />);
    }).toThrow('useHydraOneContext must be used within a <HydraOneProvider>');

    spy.mockRestore();
  });
});
