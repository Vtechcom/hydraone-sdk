// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { HydraOneProvider } from '../../src/react/context';
import { useHostStorage } from '../../src/react/useHostStorage';
import { InMemoryStorageAdapter } from '../../src/core/adapters/storage';

describe('useHostStorage hook', () => {
  let storage: InMemoryStorageAdapter;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <HydraOneProvider storage={storage}>{children}</HydraOneProvider>
  );

  it('hoạt động chuẩn xác bên trong HydraOneProvider', async () => {
    const { result } = renderHook(() => useHostStorage(), { wrapper });

    expect(result.current.isAvailable).toBe(true);

    await act(async () => {
      await result.current.setItem('hydra:sdk:session:color', 'blue');
    });

    const val = await result.current.getItem('hydra:sdk:session:color');
    expect(val).toBe('blue');

    await act(async () => {
      await result.current.removeItem('hydra:sdk:session:color');
    });

    const deleted = await result.current.getItem('hydra:sdk:session:color');
    expect(deleted).toBeNull();
  });

  it('hỗ trợ xóa toàn bộ với clear()', async () => {
    const { result } = renderHook(() => useHostStorage(), { wrapper });

    await act(async () => {
      await result.current.setItem('hydra:sdk:k1', 'v1');
      await result.current.setItem('hydra:sdk:k2', 'v2');
    });

    expect(await result.current.getItem('hydra:sdk:k1')).toBe('v1');
    expect(await result.current.getItem('hydra:sdk:k2')).toBe('v2');

    await act(async () => {
      await result.current.clear();
    });

    expect(await result.current.getItem('hydra:sdk:k1')).toBeNull();
    expect(await result.current.getItem('hydra:sdk:k2')).toBeNull();
  });

  it('hoạt động độc lập ngoài Provider khi truyền storage option', async () => {
    const customStorage = new InMemoryStorageAdapter();
    const { result } = renderHook(() => useHostStorage({ storage: customStorage }));

    expect(result.current.storage).toBe(customStorage);
    await act(async () => {
      await result.current.setItem('hydra:sdk:test', 'hello');
    });

    expect(await customStorage.getItem('hydra:sdk:test')).toBe('hello');
  });

  it('fallback an toàn khi gọi ngoài Provider mà không truyền storage', async () => {
    const { result } = renderHook(() => useHostStorage());

    expect(result.current.isAvailable).toBe(true);
    await act(async () => {
      await result.current.setItem('hydra:sdk:standalone', 'ok');
    });

    expect(await result.current.getItem('hydra:sdk:standalone')).toBe('ok');
  });
});
