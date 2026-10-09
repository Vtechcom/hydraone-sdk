import { describe, it, expect } from 'vitest';
import { cardanoHexToBech32, cardanoBech32ToHex, encodeBech32, decodeBech32 } from '../../src/cardano/address';

describe('Cardano Address & Bech32 Utility', () => {
  it('mã hóa và giải mã chuỗi Bech32 chuẩn', () => {
    const rawBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const encoded = encodeBech32('test', rawBytes);
    expect(encoded.startsWith('test1')).toBe(true);

    const decoded = decodeBech32(encoded);
    expect(decoded.hrp).toBe('test');
    expect(Array.from(decoded.data)).toEqual(Array.from(rawBytes));
  });

  it('chuyển đổi địa chỉ Hex Testnet (network tag = 0) sang addr_test1...', () => {
    // 00 = testnet base address (header byte 00)
    const hex = '00' + '11'.repeat(28) + '22'.repeat(28);
    const bech32 = cardanoHexToBech32(hex);
    expect(bech32.startsWith('addr_test1')).toBe(true);

    const backToHex = cardanoBech32ToHex(bech32);
    expect(backToHex).toBe(hex);
  });

  it('chuyển đổi địa chỉ Hex Mainnet (network tag = 1) sang addr1...', () => {
    // 01 = mainnet base address (header byte 01)
    const hex = '01' + 'aa'.repeat(28) + 'bb'.repeat(28);
    const bech32 = cardanoHexToBech32(hex);
    expect(bech32.startsWith('addr1')).toBe(true);

    const backToHex = cardanoBech32ToHex(bech32);
    expect(backToHex).toBe(hex);
  });

  it('giữ nguyên nếu địa chỉ đầu vào đã là Bech32', () => {
    const addr = 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';
    expect(cardanoHexToBech32(addr)).toBe(addr);
  });
});
