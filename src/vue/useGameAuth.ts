import { ref, computed, onScopeDispose, getCurrentScope, getCurrentInstance, onMounted } from 'vue';
import type { ComputedRef } from 'vue';
import type { AuthSession, SignInParams, AuthState } from '../core/types';
import { GameAuthManager, isJwtExpired } from '../core/auth';
import { SafeLocalStorageAdapter, InMemoryStorageAdapter } from '../core/adapters/storage';
import { getSharedWalletBridgeClient } from './useWalletBridgeClient';
import type { UseGameAuthOptions, UseGameAuthReturn } from './types';

/**
 * Shared default GameAuthManager instance
 */
let sharedAuthManagerInstance: GameAuthManager | null = null;

/**
 * Returns the shared default GameAuthManager, creating it on first use
 */
export function getSharedGameAuthManager(options?: UseGameAuthOptions): GameAuthManager {
  if (!sharedAuthManagerInstance) {
    const client = options?.client ?? getSharedWalletBridgeClient();
    const storage =
      typeof window !== 'undefined'
        ? new SafeLocalStorageAdapter()
        : new InMemoryStorageAdapter();

    sharedAuthManagerInstance = new GameAuthManager({
      client,
      storage,
    });
  }
  return sharedAuthManagerInstance;
}

/**
 * Sets the shared default GameAuthManager
 */
export function setSharedGameAuthManager(authManager: GameAuthManager | null): void {
  sharedAuthManagerInstance = authManager;
}

/**
 * Headless useGameAuth composable for Vue 3.5+ and Nuxt 3 / Nuxt 4
 *
 * Manages the one-click CIP-8 Web3 session, keeps the JWT in storage,
 * reflects token expiry reactively and cleans up listeners to avoid memory leaks.
 *
 * @param options Composable options
 * @returns Object with reactive refs, computed values and actions
 */
export function useGameAuth(options?: UseGameAuthOptions): UseGameAuthReturn {
  // 1. Resolve the GameAuthManager (authManager option, then a dedicated client, then the shared manager)
  const authManager: GameAuthManager =
    options?.authManager ??
    (options?.client
      ? new GameAuthManager({
          client: options.client,
          storage:
            typeof window !== 'undefined'
              ? new SafeLocalStorageAdapter()
              : new InMemoryStorageAdapter(),
        })
      : getSharedGameAuthManager(options));

  // 2. Read the current state
  const initialState: AuthState = authManager.state;

  const isAuthenticated = ref<boolean>(initialState.isAuthenticated);
  const jwtToken = ref<string | null>(initialState.token);
  const address = ref<string | null>(initialState.address);
  const claims = ref<Record<string, any> | null>(initialState.claims ?? null);
  const error = ref<Error | null>(initialState.error ?? null);

  // 3. Computed JWT expiry check
  const isExpired: ComputedRef<boolean> = computed(() => {
    if (!jwtToken.value) {
      return true;
    }
    return isJwtExpired(jwtToken.value);
  });

  // 4. Copy AuthState into the reactive refs
  const syncState = (state: AuthState): void => {
    isAuthenticated.value = state.isAuthenticated;
    jwtToken.value = state.token;
    address.value = state.address;
    claims.value = state.claims ?? null;
    error.value = state.error ?? null;
  };

  // 5. Subscribe to AUTH_STATE_CHANGED (client only, so SSR never leaks listeners)
  let unsubscribe: (() => void) | undefined;
  if (typeof window !== 'undefined') {
    unsubscribe = authManager.onAuthStateChanged((newState: AuthState) => {
      syncState(newState);
    });
  }

  // 6. Remove the listener when the reactive scope or component is disposed (onScopeDispose)
  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
          // Ignore errors thrown while unsubscribing
        }
      }
    });
  }

  // 7. Sign-in, sign-out and session-check actions
  const signIn = async (params: SignInParams): Promise<AuthSession> => {
    try {
      error.value = null;
      const session = await authManager.signIn(params);
      syncState(authManager.state);
      return session;
    } catch (err: any) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      error.value = errObj;
      throw errObj;
    }
  };

  const login = async (params: SignInParams): Promise<AuthSession> => {
    return signIn(params);
  };

  const signOut = async (): Promise<void> => {
    try {
      error.value = null;
      await authManager.signOut();
      syncState(authManager.state);
    } catch (err: any) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      error.value = errObj;
      throw errObj;
    }
  };

  const logout = async (): Promise<void> => {
    return signOut();
  };

  const checkSession = async (): Promise<AuthState> => {
    try {
      const state = await authManager.checkSession();
      syncState(state);
      return state;
    } catch (err: any) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      error.value = errObj;
      throw errObj;
    }
  };

  // 8. Check the saved session on mount (client only)
  if (typeof window !== 'undefined' && getCurrentInstance()) {
    onMounted(() => {
      if (options?.autoCheckSession !== false) {
        checkSession().catch((err) => {
          error.value = err instanceof Error ? err : new Error(String(err));
        });
      }
    });
  }

  return {
    authManager,
    isAuthenticated,
    jwtToken,
    address,
    claims,
    isExpired,
    error,
    signIn,
    login,
    signOut,
    logout,
    checkSession,
  };
}
