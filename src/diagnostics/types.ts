/**
 * Định nghĩa types và interfaces cho Bridge Health Diagnostics Suite
 * (@hydraone/sdk/diagnostics)
 */

/**
 * Trạng thái đánh giá của từng hạng mục kiểm tra hoặc toàn bộ báo cáo
 */
export type DiagnosticStatus = 'PASS' | 'WARN' | 'FAIL';

/**
 * Mã định danh tiêu chuẩn cho các hạng mục kiểm tra
 */
export type DiagnosticCheckId =
  | 'iframe-sandbox'
  | 'postmessage-latency'
  | 'storage-local'
  | 'storage-relay'
  | (string & {});

/**
 * Kết quả chi tiết của một hạng mục kiểm tra chẩn đoán
 */
export interface DiagnosticCheckItem {
  /**
   * Mã định danh duy nhất của bài kiểm tra
   */
  id: DiagnosticCheckId;

  /**
   * Tên hiển thị người dùng của bài kiểm tra
   */
  name: string;

  /**
   * Kết quả đánh giá: PASS (Đạt), WARN (Cảnh báo), hoặc FAIL (Thất bại)
   */
  status: DiagnosticStatus;

  /**
   * Thông điệp giải thích ngắn gọn kết quả
   */
  message: string;

  /**
   * Độ trễ đo được (tính bằng mili-giây), áp dụng cho các bài test hiệu năng/ping
   */
  latencyMs?: number;

  /**
   * Dữ liệu bổ sung chi tiết phục vụ debug
   */
  details?: Record<string, unknown>;

  /**
   * Gợi ý khắc phục cụ thể khi trạng thái là WARN hoặc FAIL
   */
  hint?: string;
}

/**
 * Thông tin môi trường thực thi của client
 */
export interface DiagnosticEnvironmentInfo {
  /**
   * Client có đang chạy bên trong iframe hay không
   */
  isIframe: boolean;

  /**
   * Client có đang chạy ở chế độ độc lập ngoài iframe hay không
   */
  isStandalone: boolean;

  /**
   * Origin của trang hiện tại
   */
  origin: string;

  /**
   * Chuỗi User-Agent của trình duyệt (nếu có)
   */
  userAgent?: string;
}

/**
 * Báo cáo tổng thể tình trạng sức khỏe kết nối cầu nối HydraOne
 */
export interface BridgeHealthReport {
  /**
   * Trạng thái tổng thể: FAIL nếu có bất kỳ check FAIL, WARN nếu có WARN và không có FAIL, ngược lại PASS
   */
  status: DiagnosticStatus;

  /**
   * Thời điểm thực hiện chẩn đoán (epoch ms)
   */
  timestamp: number;

  /**
   * Thông tin môi trường thực thi
   */
  environment: DiagnosticEnvironmentInfo;

  /**
   * Danh sách kết quả chi tiết từng bài kiểm tra
   */
  checks: DiagnosticCheckItem[];

  /**
   * Tóm tắt tổng quan kết quả chẩn đoán (ví dụ: "All 3 checks passed" hoặc "1 failure, 2 warnings")
   */
  summary: string;
}

/**
 * Tùy chọn cấu hình khi chạy kiểm tra độ trễ PostMessage
 */
export interface LatencyCheckOptions {
  /**
   * Thời gian chờ tối đa (ms) trước khi đánh dấu thất bại do timeout (mặc định 3,000ms)
   */
  timeoutMs?: number;

  /**
   * Ngưỡng độ trễ cảnh báo (ms). Nếu độ trễ vượt quá ngưỡng này sẽ đánh dấu WARN (mặc định 150ms)
   */
  warningThresholdMs?: number;
}

import type { IStorage } from '../core/ports/storage';

/**
 * Tùy chọn cấu hình khi chạy kiểm tra lưu trữ Storage
 */
export interface StorageCheckOptions {
  /**
   * Tên khóa kiểm tra tạm thời (mặc định sinh ngẫu nhiên với tiền tố hydra:sdk:diag:test_*)
   */
  customKey?: string;

  /**
   * Adapter Storage tùy chỉnh cần kiểm tra (mặc định kiểm tra LocalStorage và HostStorageRelay qua client)
   */
  storage?: IStorage;
}

/**
 * Tùy chọn cấu hình tổng thể cho hàm checkBridgeHealth()
 */
export interface CheckHealthOptions extends LatencyCheckOptions, StorageCheckOptions {
  /**
   * Bỏ qua bài kiểm tra sandbox iframe
   */
  skipIframeCheck?: boolean;

  /**
   * Bỏ qua bài kiểm tra độ trễ postMessage
   */
  skipLatencyCheck?: boolean;

  /**
   * Bỏ qua bài kiểm tra tính sẵn sàng của storage
   */
  skipStorageCheck?: boolean;
}
