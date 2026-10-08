/**
 * Rút gọn địa chỉ ví Cardano để hiển thị thân thiện trên UI dApp/Game
 *
 * @param address Chuỗi địa chỉ ví
 * @param startChars Số lượng ký tự tiền tố giữ lại (mặc định: 6, ví dụ "addr1q")
 * @param endChars Số lượng ký tự hậu tố giữ lại (mặc định: 4, ví dụ "4xyz")
 * @returns Chuỗi rút gọn (e.g. "addr1q...4xyz") hoặc chuỗi rỗng khi địa chỉ không hợp lệ
 */
export function formatShortAddress(
  address: string | null | undefined,
  startChars = 6,
  endChars = 4
): string {
  if (!address || typeof address !== 'string') {
    return '';
  }
  const cleanAddress = address.trim();
  if (cleanAddress.length === 0) {
    return '';
  }
  if (startChars <= 0 || endChars <= 0) {
    return cleanAddress;
  }
  if (cleanAddress.length <= startChars + endChars) {
    return cleanAddress;
  }
  return `${cleanAddress.slice(0, startChars)}...${cleanAddress.slice(-endChars)}`;
}
