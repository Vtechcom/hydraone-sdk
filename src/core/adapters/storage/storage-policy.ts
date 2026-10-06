/**
 * Hằng số và chính sách phân vùng Sub-Namespace lưu trữ của HydraOne SDK
 * Tuân thủ kiến trúc phân tầng AD-3:
 * - hydra:sdk:auth:*     -> Dữ liệu phiên đăng nhập, JWT, ví
 * - hydra:sdk:session:*  -> Dữ liệu phiên chơi game, cache tạm thời
 */

export const STORAGE_PREFIX = 'hydra:sdk:';
export const STORAGE_AUTH_PREFIX = 'hydra:sdk:auth:';
export const STORAGE_SESSION_PREFIX = 'hydra:sdk:session:';

export type StorageSubNamespace = 'auth' | 'session';

/**
 * Kiểm tra xem một khóa lưu trữ có thuộc quyền quản lý của SDK hay không
 * @param key Khóa cần kiểm tra
 */
export function isSdkStorageKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith(STORAGE_PREFIX);
}

/**
 * Kiểm tra xem một khóa lưu trữ có thuộc phân vùng xác thực auth hay không
 * @param key Khóa cần kiểm tra
 */
export function isAuthStorageKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith(STORAGE_AUTH_PREFIX);
}

/**
 * Kiểm tra xem một khóa lưu trữ có thuộc phân vùng session hay không
 * @param key Khóa cần kiểm tra
 */
export function isSessionStorageKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith(STORAGE_SESSION_PREFIX);
}

/**
 * Xây dựng khóa lưu trữ chuẩn hóa theo sub-namespace
 * @param subNamespace Phân vùng ('auth' | 'session')
 * @param subKey Tên khóa con
 * @returns Khóa hoàn chỉnh có tiền tố chuẩn hóa, ví dụ: 'hydra:sdk:auth:token'
 */
export function buildStorageKey(subNamespace: StorageSubNamespace, subKey: string): string {
  if (subNamespace !== 'auth' && subNamespace !== 'session') {
    throw new Error("Storage subNamespace must be 'auth' or 'session'");
  }

  if (!subKey || typeof subKey !== 'string') {
    throw new Error('Storage subKey must be a non-empty string');
  }

  // Loại bỏ tiền tố hai chấm và khoảng trắng thừa nếu người gọi đã vô tình truyền kèm
  const cleanSubKey = subKey.replace(/^:+/, '').trim();
  if (!cleanSubKey) {
    throw new Error('Storage subKey must be a non-empty string');
  }

  return `${STORAGE_PREFIX}${subNamespace}:${cleanSubKey}`;
}
