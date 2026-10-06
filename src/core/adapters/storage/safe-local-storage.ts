import type { IStorage } from '../../ports/storage';
import { InMemoryStorageAdapter } from './in-memory-storage';
import { isSdkStorageKey } from './storage-policy';

export interface SafeLocalStorageAdapterOptions {
  /**
   * Tham chiếu đến đối tượng Storage của trình duyệt (mặc định lấy globalThis.localStorage nếu có)
   */
  storage?: Storage;
  /**
   * Bộ lưu trữ dự phòng khi localStorage bị chặn hoặc gặp lỗi (mặc định InMemoryStorageAdapter)
   */
  fallbackStorage?: IStorage;
  /**
   * Callback nhận thông báo khi adapter tự động chuyển sang chế độ dự phòng
   */
  onFallback?: (error: unknown) => void;
}

/**
 * Adapter bọc an toàn window.localStorage
 * Tự động phát hiện và chuyển đổi trong suốt sang InMemoryStorageAdapter khi:
 * - Chạy trong iframe cross-origin bị Safari ITP / Storage Partitioning chặn
 * - Trình duyệt ở chế độ duyệt web ẩn danh (Private Browsing) ném SecurityError
 * - Bộ nhớ lưu trữ bị đầy (QuotaExceededError)
 * - Môi trường không có DOM/Window (SSR, Node.js)
 */
export class SafeLocalStorageAdapter implements IStorage {
  private readonly storage?: Storage;
  private readonly fallbackStorage: IStorage;
  private readonly onFallback?: (error: unknown) => void;
  private _isUsingFallback: boolean = false;

  constructor(options: SafeLocalStorageAdapterOptions = {}) {
    this.fallbackStorage = options.fallbackStorage ?? new InMemoryStorageAdapter();
    this.onFallback = options.onFallback;

    // Xác định đối tượng Storage khả dụng
    if (options.storage !== undefined) {
      this.storage = options.storage;
    } else if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      try {
        this.storage = globalThis.localStorage;
      } catch (err) {
        // Trường hợp truy cập thuộc tính window.localStorage bị ném SecurityError ngay từ đầu
        this.activateFallback(err);
        return;
      }
    }

    if (!this.storage) {
      this.activateFallback(new Error('localStorage is not available in current environment'));
      return;
    }

    // Kiểm tra quyền ghi/đọc thực tế (probe test) để phát hiện sớm lỗi Safari ITP
    this.probeStorage();
  }

  /**
   * Trạng thái cho biết adapter có đang phải chuyển sang dùng RAM fallback hay không
   */
  get isUsingFallback(): boolean {
    return this._isUsingFallback;
  }

  /**
   * Đối tượng lưu trữ dự phòng đang được sử dụng
   */
  get fallback(): IStorage {
    return this.fallbackStorage;
  }

  /**
   * Tham chiếu đến đối tượng Storage gốc (nếu có) phục vụ chẩn đoán
   */
  get underlyingStorage(): Storage | undefined {
    return this.storage;
  }

  /**
   * Kích hoạt chế độ fallback an toàn sang InMemoryStorage
   */
  private activateFallback(error: unknown): void {
    if (!this._isUsingFallback) {
      this._isUsingFallback = true;
      if (this.onFallback) {
        try {
          this.onFallback(error);
        } catch {
          // Bảo đảm onFallback callback không ném lỗi làm crash adapter
        }
      }
    }
  }

  /**
   * Kiểm tra khả năng tương tác đọc/ghi của Storage
   */
  private probeStorage(): void {
    if (!this.storage) {
      this.activateFallback(new Error('Storage is undefined'));
      return;
    }

    try {
      const probeKey = `__hydra_probe_${Date.now()}__`;
      this.storage.setItem(probeKey, '1');
      this.storage.removeItem(probeKey);
    } catch (err) {
      this.activateFallback(err);
    }
  }

  /**
   * Lấy giá trị chuỗi ứng với key đã cho
   */
  async getItem(key: string): Promise<string | null> {
    if (this._isUsingFallback || !this.storage) {
      const fallbackVal = await this.fallbackStorage.getItem(key);
      if (fallbackVal !== null) {
        return fallbackVal;
      }

      // Nếu trong RAM chưa có, thử đọc từ underlying storage (nếu storage chỉ bị chặn ghi do quota)
      if (this.storage) {
        try {
          return this.storage.getItem(key);
        } catch {
          return null;
        }
      }

      return null;
    }

    try {
      return this.storage.getItem(key);
    } catch (err) {
      this.activateFallback(err);
      return this.fallbackStorage.getItem(key);
    }
  }

  /**
   * Lưu trữ cặp khóa - giá trị
   */
  async setItem(key: string, value: string): Promise<void> {
    if (this._isUsingFallback || !this.storage) {
      await this.fallbackStorage.setItem(key, value);
      return;
    }

    try {
      this.storage.setItem(key, String(value));
    } catch (err) {
      this.activateFallback(err);
      await this.fallbackStorage.setItem(key, value);
    }
  }

  /**
   * Xóa một key cụ thể khỏi bộ nhớ lưu trữ
   */
  async removeItem(key: string): Promise<void> {
    if (this._isUsingFallback || !this.storage) {
      await this.fallbackStorage.removeItem(key);
      return;
    }

    try {
      this.storage.removeItem(key);
      // Đồng thời dọn dẹp trong fallbackStorage nếu key từng tồn tại trong RAM
      await this.fallbackStorage.removeItem(key);
    } catch (err) {
      this.activateFallback(err);
      await this.fallbackStorage.removeItem(key);
    }
  }

  /**
   * Dọn dẹp có chọn lọc: chỉ xóa các khóa thuộc quyền quản lý của SDK (bắt đầu bằng `hydra:sdk:*`).
   * Tuyệt đối không xóa bất kỳ khóa nào của Game.
   */
  async clear(): Promise<void> {
    if (this._isUsingFallback || !this.storage) {
      await this.fallbackStorage.clear();
      return;
    }

    try {
      // Quét danh sách các khóa và chỉ xóa khóa khớp tiền tố `hydra:sdk:*`
      const keysToRemove: string[] = [];
      const length = this.storage.length;

      for (let i = 0; i < length; i++) {
        const k = this.storage.key(i);
        if (k && isSdkStorageKey(k)) {
          keysToRemove.push(k);
        }
      }

      for (const k of keysToRemove) {
        this.storage.removeItem(k);
      }

      // Luôn đồng bộ dọn dẹp cả fallbackStorage
      await this.fallbackStorage.clear();
    } catch (err) {
      this.activateFallback(err);
      await this.fallbackStorage.clear();
    }
  }
}
