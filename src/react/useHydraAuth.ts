import { useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { HydraOneContext } from './context';
import type { UseHydraAuthOptions, UseHydraAuthReturn } from './types';
import type { AuthSession, SignInParams, AuthState } from '../core/types';
import { GameAuthManager, isJwtExpired, parseJwt } from '../core/auth';
import { SafeLocalStorageAdapter, InMemoryStorageAdapter } from '../core/adapters/storage';

/**
 * Custom React Hook quản lý trạng thái xác thực Web3 CIP-8, phiên JWT và các hành động đăng nhập/đăng xuất
 *
 * @param options Tùy chọn cấu hình useHydraAuth (authManager override, client override)
 * @returns Toàn bộ reactive states và dispatch actions của GameAuthManager
 */
export function useHydraAuth(options?: UseHydraAuthOptions): UseHydraAuthReturn {
  const context = useContext(HydraOneContext);

  // Khởi tạo nội bộ authManager fallback nếu không có manager từ options hoặc context
  const internalAuthManagerRef = useRef<GameAuthManager | null>(null);
  const client = options?.client ?? context?.client;
  if (!options?.authManager && !context?.authManager && client && !internalAuthManagerRef.current) {
    const storage =
      options?.storage ??
      context?.storage ??
      (typeof window !== 'undefined'
        ? new SafeLocalStorageAdapter()
        : new InMemoryStorageAdapter());
    internalAuthManagerRef.current = new GameAuthManager({
      client,
      storage,
    });
  }

  const authManager =
    options?.authManager ?? context?.authManager ?? internalAuthManagerRef.current;

  if (!authManager) {
    throw new Error(
      'useHydraAuth must be used within a <HydraOneProvider> or passed an authManager/client option'
    );
  }

  // 1. Khởi tạo states
  const [authState, setAuthState] = useState<AuthState>(() => authManager.state);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(() => authManager.state.error ?? null);

  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 2. Computed values
  const isAuthenticated = authState.isAuthenticated;
  const token = authState.token;
  const jwtToken = token;
  const address = authState.address;

  const claims = useMemo<Record<string, any> | null>(() => {
    if (authState.claims) return authState.claims;
    if (token) {
      try {
        return parseJwt<Record<string, any>>(token);
      } catch {
        return null;
      }
    }
    return null;
  }, [authState.claims, token]);

  const user = useMemo<Record<string, any> | null>(() => {
    return claims ?? (address ? { address } : null);
  }, [claims, address]);

  const isExpired = useMemo<boolean>(() => {
    if (!token) return true;
    return isJwtExpired(token);
  }, [token]);

  // 3. Actions
  const signIn = useCallback(
    async (params: SignInParams): Promise<AuthSession> => {
      setIsAuthenticating(true);
      setError(null);
      try {
        const newSession = await authManager.signIn(params);
        if (isMountedRef.current) {
          setAuthState(authManager.state);
        }
        return newSession;
      } catch (err: unknown) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        if (isMountedRef.current) {
          setError(errObj);
        }
        throw errObj;
      } finally {
        if (isMountedRef.current) {
          setIsAuthenticating(false);
        }
      }
    },
    [authManager]
  );

  const login = signIn;

  const signOut = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      await authManager.signOut();
      if (isMountedRef.current) {
        setAuthState(authManager.state);
      }
    } catch (err: unknown) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      if (isMountedRef.current) {
        setError(errObj);
      }
      throw errObj;
    }
  }, [authManager]);

  const logout = signOut;

  const checkSession = useCallback(async (): Promise<AuthState> => {
    try {
      const refreshedState = await authManager.checkSession();
      if (isMountedRef.current) {
        setAuthState(refreshedState);
      }
      return refreshedState;
    } catch (err: unknown) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      if (isMountedRef.current) {
        setError(errObj);
      }
      throw errObj;
    }
  }, [authManager]);

  const refreshSession = checkSession;

  // 4. Lắng nghe AUTH_STATE_CHANGED trong useEffect (SSR Safe)
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setAuthState(authManager.state);
    setError(authManager.state.error ?? null);

    const unsubscribe = authManager.onAuthStateChanged((newState: AuthState) => {
      if (!isMountedRef.current) return;
      setAuthState(newState);
      setError(newState.error ?? null);
    });

    return () => {
      try {
        unsubscribe();
      } catch {
        // Bỏ qua lỗi unsubscribe
      }
    };
  }, [authManager]);

  return {
    authManager,
    authState,
    isAuthenticated,
    token,
    jwtToken,
    address,
    claims,
    user,
    isExpired,
    isAuthenticating,
    error,
    signIn,
    login,
    signOut,
    logout,
    checkSession,
    refreshSession,
  };
}
