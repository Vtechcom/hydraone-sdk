import { ref, computed, onScopeDispose, getCurrentScope, getCurrentInstance, onMounted } from 'vue';
import type { ComputedRef } from 'vue';
import type { AuthSession, SignInParams, AuthState } from '../core/types';
import { GameAuthManager, isJwtExpired } from '../core/auth';
import { SafeLocalStorageAdapter, InMemoryStorageAdapter } from '../core/adapters/storage';
import { getSharedWalletBridgeClient } from './useWalletBridgeClient';
import type { UseGameAuthOptions, UseGameAuthReturn } from './types';

/**
 * Biến lưu instance GameAuthManager mặc định dùng chung
 */
let sharedAuthManagerInstance: GameAuthManager | null = null;

/**
 * Lấy hoặc khởi tạo instance GameAuthManager mặc định
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
 * Thiết lập instance GameAuthManager mặc định
 */
export function setSharedGameAuthManager(authManager: GameAuthManager | null): void {
  sharedAuthManagerInstance = authManager;
}

/**
 * Headless Composable useGameAuth cho Vue 3.5+ và Nuxt 3 / Nuxt 4
 *
 * Quản lý phiên đăng nhập 1-click Web3 CIP-8, lưu trữ JWT an toàn,
 * tự động phản ánh trạng thái hạn dùng của token và cleanup chống rò rỉ bộ nhớ.
 *
 * @param options Tùy chọn cấu hình composable
 * @returns Object chứa các reactive refs, computed properties và actions
 */
export function useGameAuth(options?: UseGameAuthOptions): UseGameAuthReturn {
  // 1. Xác định instance GameAuthManager (ưu tiên authManager -> client riêng -> shared manager)
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

  // 2. Lấy trạng thái hiện tại
  const initialState: AuthState = authManager.state;

  const isAuthenticated = ref<boolean>(initialState.isAuthenticated);
  const jwtToken = ref<string | null>(initialState.token);
  const address = ref<string | null>(initialState.address);
  const claims = ref<Record<string, any> | null>(initialState.claims ?? null);
  const error = ref<Error | null>(initialState.error ?? null);

  // 3. Computed kiểm tra hạn sử dụng JWT
  const isExpired: ComputedRef<boolean> = computed(() => {
    if (!jwtToken.value) {
      return true;
    }
    return isJwtExpired(jwtToken.value);
  });

  // 4. Hàm đồng bộ trạng thái nội bộ từ AuthState
  const syncState = (state: AuthState): void => {
    isAuthenticated.value = state.isAuthenticated;
    jwtToken.value = state.token;
    address.value = state.address;
    claims.value = state.claims ?? null;
    error.value = state.error ?? null;
  };

  // 5. Đăng ký lắng nghe sự kiện AUTH_STATE_CHANGED từ AuthManager (chỉ chạy ở client-side để tránh rò rỉ SSR)
  let unsubscribe: (() => void) | undefined;
  if (typeof window !== 'undefined') {
    unsubscribe = authManager.onAuthStateChanged((newState: AuthState) => {
      syncState(newState);
    });
  }

  // 6. Tự động dọn dẹp listener khi reactive scope hoặc component bị hủy (onScopeDispose)
  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
          // Bỏ qua lỗi khi unsubscribe
        }
      }
    });
  }

  // 7. Actions đăng nhập, đăng xuất và kiểm tra session
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

  // 8. Tự động kiểm tra session khi mounted ở client-side trong component
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
