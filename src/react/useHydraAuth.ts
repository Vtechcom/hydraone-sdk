import { useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { HydraOneContext } from './context';
import type { UseHydraAuthOptions, UseHydraAuthReturn } from './types';
import type { AuthSession, SignInParams, AuthState } from '../core/types';
import { GameAuthManager, isJwtExpired } from '../core/auth';
import { SafeLocalStorageAdapter, InMemoryStorageAdapter } from '../core/adapters/storage';

/**
 * Custom React Hook quản lý trạng thái xác thực Web3 CIP-8, phiên JWT và các hành động đăng nhập/đăng xuất
 *
 * @param options Tùy chọn cấu hình useHydraAuth (authManager override, client override)
 * @returns Toàn bộ reactive states và dispatch actions của GameAuthManager
 */
export function useHydraAuth(options?: UseHydraAuthOptions): UseHydraAuthReturn {
  const context = useContext(HydraOneContext);

  // Khởi tạo hoặc lấy authManager từ options hoặc context
  const authManagerRef = useRef<GameAuthManager | null>(null);
  if (!authManagerRef.current) {
    if (options?.authManager) {
      authManagerRef.current = options.authManager;
    } else if (context?.authManager) {
      authManagerRef.current = context.authManager;
    } else if (options?.client ?? context?.client) {
      const activeClient = (options?.client ?? context?.client)!;
      const storage =
        options?.storage ??
        context?.storage ??
        (typeof window !== 'undefined'
          ? new SafeLocalStorageAdapter()
          : new InMemoryStorageAdapter());
      authManagerRef.current = new GameAuthManager({
        client: activeClient,
        storage,
      });
    }
  }

  const authManager = options?.authManager ?? authManagerRef.current;

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
  const claims = authState.claims ?? null;

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

    const unsubscribe = authManager.onAuthStateChanged((newState: AuthState) => {
      if (!isMountedRef.current) return;
      setAuthState(newState);
      if (newState.error) {
        setError(newState.error);
      }
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

/**
 * Shorthand alias cho useHydraAuth
 */
export const useAuth = useHydraAuth;
