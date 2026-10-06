import type { IStorage } from '../../ports/storage';
import { isSdkStorageKey } from './storage-policy';

/**
 * Adapter lưu trữ trong bộ nhớ RAM (In-Memory Storage)
 * Đóng vai trò Availability Fallback khi trình duyệt chặn localStorage (Safari ITP / private browsing)
 * hoặc khi chạy trong môi trường SSR/Node.js.
 */
export class InMemoryStorageAdapter implements IStorage {
  private readonly store: Map<string, string>;

  constructor(initialEntries?: Record<string, string> | Map<string, string>) {
    if (initialEntries instanceof Map) {
      this.store = new Map(initialEntries);
    } else if (initialEntries && typeof initialEntries === 'object') {
      this.store = new Map(Object.entries(initialEntries));
    } else {
      this.store = new Map();
    }
  }

  /**
   * Lấy giá trị chuỗi ứng với key đã cho
   */
  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  /**
   * Lưu trữ cặp khóa - giá trị
   */
  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, String(value));
  }

  /**
   * Xóa một key cụ thể khỏi bộ nhớ lưu trữ
   */
  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }

  /**
   * Dọn dẹp có chọn lọc: chỉ xóa các khóa thuộc tiền tố `hydra:sdk:*`.
   * Bảo toàn 100% dữ liệu riêng của game không mang tiền tố SDK.
   */
  async clear(): Promise<void> {
    for (const key of Array.from(this.store.keys())) {
      if (isSdkStorageKey(key)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Phương thức trợ giúp kiểm tra số lượng khóa hiện có trong bộ nhớ
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Xóa toàn bộ dữ liệu trong bộ nhớ RAM không phân biệt namespace (chủ yếu phục vụ unit test)
   */
  async clearAll(): Promise<void> {
    this.store.clear();
  }
}
