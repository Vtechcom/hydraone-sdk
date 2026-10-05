/**
 * Port IStorage - Trừu tượng hóa việc lưu trữ cặp khóa - giá trị (Key-Value)
 * hỗ trợ các adapter như SafeLocalStorage, InMemoryStorage và HostStorageRelay.
 */
export interface IStorage {
  /**
   * Lấy giá trị chuỗi ứng với key đã cho
   * @param key Khóa cần truy vấn
   * @returns Giá trị chuỗi nếu tồn tại, ngược lại trả về null
   */
  getItem(key: string): Promise<string | null>;

  /**
   * Lưu trữ cặp khóa - giá trị
   * @param key Khóa lưu trữ
   * @param value Giá trị chuỗi cần lưu
   */
  setItem(key: string, value: string): Promise<void>;

  /**
   * Xóa một key cụ thể khỏi bộ nhớ lưu trữ
   * @param key Khóa cần xóa
   */
  removeItem(key: string): Promise<void>;

  /**
   * Dọn dẹp các khóa thuộc quyền quản lý của SDK (chỉ xóa tiền tố `hydra:sdk:*`,
   * tuyệt đối không xóa dữ liệu riêng của game).
   */
  clear(): Promise<void>;
}
