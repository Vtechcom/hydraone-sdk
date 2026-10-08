import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';

const ROOT_DIR = path.resolve(__dirname, '../../');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

describe('Story 6.2: Interactive Developer Documentation Portal & Guides', () => {
  describe('1. File Structure & Completeness', () => {
    const requiredFiles = [
      'index.html',
      'styles.css',
      'app.js',
      'quickstart.md',
      'api-reference.md',
      'safari-itp-guide.md',
      'architecture-overview.md'
    ];

    it.each(requiredFiles)('tệp docs/%s phải tồn tại và không rỗng', (file) => {
      const filePath = path.join(DOCS_DIR, file);
      expect(fs.existsSync(filePath), `Tệp ${file} không tồn tại`).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.trim().length, `Tệp ${file} bị rỗng`).toBeGreaterThan(50);
    });

    it('tệp README.md gốc phải tồn tại và có đầy đủ các thông tin cốt lõi', () => {
      const readmePath = path.join(ROOT_DIR, 'README.md');
      expect(fs.existsSync(readmePath)).toBe(true);
      const content = fs.readFileSync(readmePath, 'utf-8');
      expect(content).toContain('@hydraone/sdk');
      expect(content).toContain('Quickstart');
      expect(content).toContain('create-hydraone-game');
      expect(content).toContain('Safari ITP');
      expect(content).toContain('docs/quickstart.md');
      expect(content).toContain('pnpm run docs');
    });

    it('package.json phải chứa script "docs" phục vụ xem tài liệu', () => {
      const pkgPath = path.join(ROOT_DIR, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      expect(pkg.scripts).toBeDefined();
      expect(pkg.scripts.docs).toBeDefined();
      expect(pkg.scripts.docs).toContain('docs');
    });
  });

  describe('2. Quickstart Guide (docs/quickstart.md)', () => {
    const content = fs.readFileSync(path.join(DOCS_DIR, 'quickstart.md'), 'utf-8');

    it('phải có hướng dẫn cài đặt với pnpm/npm và create-hydraone-game', () => {
      expect(content).toContain('pnpm add @hydraone/sdk');
      expect(content).toContain('create-hydraone-game');
    });

    it('phải có hướng dẫn khởi tạo WalletBridgeClient và bắt tay handshake', () => {
      expect(content).toContain('WalletBridgeClient');
      expect(content).toContain('bridge.init()');
      expect(content).toContain('appCenterOrigin');
    });

    it('phải có hướng dẫn kết nối ví CIP-30 và xử lý từ chối', () => {
      expect(content).toContain('bridge.connect()');
      expect(content).toContain('isUserRejectedError');
    });

    it('phải có hướng dẫn truy vấn số dư và chuyển đổi Lovelace/ADA', () => {
      expect(content).toContain('bridge.getBalance()');
      expect(content).toContain('lovelaceToAda');
      expect(content).toContain('parseAssetValue');
    });

    it('phải có hướng dẫn ký giao dịch CIP-30 (signTx) và ký CIP-8 (signData)', () => {
      expect(content).toContain('bridge.signTx');
      expect(content).toContain('bridge.submitTx');
      expect(content).toContain('bridge.signData');
    });

    it('phải có hướng dẫn dev local với Mock Simulator DevTools', () => {
      expect(content).toContain('MockBridgeHost');
      expect(content).toContain('mountFloatingDevToolsUI');
    });
  });

  describe('3. API Reference (docs/api-reference.md)', () => {
    const content = fs.readFileSync(path.join(DOCS_DIR, 'api-reference.md'), 'utf-8');

    it('tài liệu hóa đầy đủ Core Client (@hydraone/sdk)', () => {
      expect(content).toContain('WalletBridgeClient');
      expect(content).toContain('init()');
      expect(content).toContain('connect');
      expect(content).toContain('getBalance');
      expect(content).toContain('getUtxos');
      expect(content).toContain('signTx');
      expect(content).toContain('signData');
      expect(content).toContain('submitTx');
      expect(content).toContain('triggerHaptic');
      expect(content).toContain('GameAuthManager');
    });

    it('tài liệu hóa subpath @hydraone/sdk/cardano', () => {
      expect(content).toContain('lovelaceToAda');
      expect(content).toContain('adaToLovelace');
      expect(content).toContain('parseAssetValue');
      expect(content).toContain('calculateMinUtxo');
      expect(content).toContain('stringToHex');
      expect(content).toContain('hexToString');
      expect(content).toContain('decodeCborValue');
    });

    it('tài liệu hóa subpath @hydraone/sdk/vue', () => {
      expect(content).toContain('useWalletBridgeClient');
      expect(content).toContain('useGameAuth');
      expect(content).toContain('formatShortAddress');
    });

    it('tài liệu hóa subpath @hydraone/sdk/react', () => {
      expect(content).toContain('HydraOneProvider');
      expect(content).toContain('useWallet');
      expect(content).toContain('useHydraAuth');
      expect(content).toContain('useHostStorage');
    });

    it('tài liệu hóa subpath @hydraone/sdk/simulator', () => {
      expect(content).toContain('MockBridgeHost');
      expect(content).toContain('mountFloatingDevToolsUI');
    });

    it('tài liệu hóa subpath @hydraone/sdk/diagnostics', () => {
      expect(content).toContain('checkBridgeHealth');
    });

    it('hướng dẫn mô hình tích hợp Phaser 3 Game Engine', () => {
      expect(content).toContain('Phaser');
      expect(content).toContain('Phaser.Scene');
    });

    it('tài liệu hóa bảng mã lỗi kế thừa từ HydraError', () => {
      expect(content).toContain('ERR_HANDSHAKE_TIMEOUT');
      expect(content).toContain('ERR_RPC_TIMEOUT');
      expect(content).toContain('ERR_USER_REJECTED');
      expect(content).toContain('ERR_INVALID_ORIGIN');
      expect(content).toContain('ERR_STORAGE_RESTRICTED');
    });
  });

  describe('4. Safari ITP Guide (docs/safari-itp-guide.md)', () => {
    const content = fs.readFileSync(path.join(DOCS_DIR, 'safari-itp-guide.md'), 'utf-8');

    it('giải thích bản chất chặn storage của WebKit Safari ITP trong iframe', () => {
      expect(content).toContain('Intelligent Tracking Prevention');
      expect(content).toContain('SecurityError');
      expect(content).toContain('localStorage');
    });

    it('mô tả kiến trúc Dual-Tier Storage và Host Storage Relay', () => {
      expect(content).toContain('Dual-Tier Storage');
      expect(content).toContain('TieredStorageAdapter');
      expect(content).toContain('HostStorageRelay');
      expect(content).toContain('HOST_STORAGE_SET');
    });

    it('nêu rõ chính sách phân vùng sub-namespace', () => {
      expect(content).toContain('Sub-namespace');
      expect(content).toContain('hydraone:');
    });

    it('hướng dẫn cấu hình thuộc tính iframe sandbox bắt buộc', () => {
      expect(content).toContain('allow-scripts');
      expect(content).toContain('allow-same-origin');
    });

    it('hướng dẫn kiểm thử với DevTools Simulator và checkBridgeHealth', () => {
      expect(content).toContain('MockBridgeHost');
      expect(content).toContain('setSafariItpMode');
      expect(content).toContain('checkBridgeHealth');
    });
  });

  describe('5. Interactive Portal Web App (HTML, CSS, JS)', () => {
    const html = fs.readFileSync(path.join(DOCS_DIR, 'index.html'), 'utf-8');
    const css = fs.readFileSync(path.join(DOCS_DIR, 'styles.css'), 'utf-8');
    const js = fs.readFileSync(path.join(DOCS_DIR, 'app.js'), 'utf-8');

    it('HTML có cấu trúc ngữ nghĩa, tiêu đề và meta description chuẩn SEO', () => {
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>');
      expect(html).toContain('HydraOne SDK');
      expect(html).toContain('name="description"');
      expect(html).toContain('name="viewport"');
    });

    it('HTML chứa đầy đủ các phân mục điều hướng chính', () => {
      const expectedSections = [
        'overview',
        'quickstart',
        'scaffolding-cli',
        'architecture',
        'safari-itp',
        'api-core',
        'api-cardano',
        'api-react',
        'api-vue',
        'api-phaser',
        'api-simulator',
        'api-diagnostics',
        'error-codes',
        'playground'
      ];

      for (const sec of expectedSections) {
        expect(html, `Thiếu section id="${sec}" trong index.html`).toContain(`id="${sec}"`);
      }
    });

    it('HTML có thanh tìm kiếm và khu vực Interactive Playground', () => {
      expect(html).toContain('id="doc-search"');
      expect(html).toContain('id="search-results"');
      expect(html).toContain('id="playground"');
      expect(html).toContain('id="btn-pg-connect"');
      expect(html).toContain('id="btn-pg-balance"');
      expect(html).toContain('id="btn-pg-signtx"');
      expect(html).toContain('id="btn-pg-signdata"');
      expect(html).toContain('id="btn-pg-storage"');
      expect(html).toContain('id="btn-pg-diag"');
      expect(html).toContain('id="pg-console"');
    });

    it('CSS có thiết kế Dark Mode, CSS variables và responsive media queries', () => {
      expect(css).toContain(':root');
      expect(css).toContain('--bg-primary');
      expect(css).toContain('--accent-cyan');
      expect(css).toContain('@media');
      expect(css).toContain('.code-block-wrapper');
      expect(css).toContain('.playground-box');
    });

    it('JavaScript cài đặt bộ tìm kiếm tức thì và phím tắt "/" hoặc "Ctrl+K"', () => {
      expect(js).toContain('searchIndex');
      expect(js).toContain('searchInput');
      expect(js).toContain('e.key === \'/\'');
      expect(js).toContain('isCmdK');
      expect(js).toContain('copy-btn');
      expect(js).toContain('navigator.clipboard.writeText');
    });

    it('JavaScript cài đặt logic tương tác Playground', () => {
      expect(js).toContain('btn-pg-connect');
      expect(js).toContain('btn-pg-balance');
      expect(js).toContain('btn-pg-signtx');
      expect(js).toContain('btn-pg-signdata');
      expect(js).toContain('btn-pg-storage');
      expect(js).toContain('btn-pg-diag');
    });

    it('HTML chứa thẻ theme-color và CSS chứa class .table-container', () => {
      expect(html).toContain('name="theme-color"');
      expect(css).toContain('.table-container');
    });
  });

  describe('6. Local Docs Server (scripts/serve-docs.js)', () => {
    it('scripts/serve-docs.js tồn tại và export createDocsServer', async () => {
      const serverPath = path.join(ROOT_DIR, 'scripts/serve-docs.js');
      expect(fs.existsSync(serverPath)).toBe(true);

      // @ts-expect-error JS module without declaration file
      const { createDocsServer } = await import('../../scripts/serve-docs.js');
      expect(typeof createDocsServer).toBe('function');

      const server = createDocsServer();
      expect(server).toBeDefined();
      expect(typeof server.listen).toBe('function');
    });

    it('createDocsServer phục vụ đúng index.html, static assets và chặn directory traversal', async () => {
      // @ts-expect-error JS module without declaration file
      const { createDocsServer } = await import('../../scripts/serve-docs.js');
      const server = createDocsServer();

      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
      });

      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        // 1. Root -> 200 text/html (index.html)
        const rootRes = await fetch(`${baseUrl}/`);
        expect(rootRes.status).toBe(200);
        expect(rootRes.headers.get('content-type')).toContain('text/html');
        const rootText = await rootRes.text();
        expect(rootText).toContain('HydraOne SDK');

        // 2. CSS asset -> 200 text/css
        const cssRes = await fetch(`${baseUrl}/styles.css`);
        expect(cssRes.status).toBe(200);
        expect(cssRes.headers.get('content-type')).toContain('text/css');

        // 3. Directory traversal attempt -> 403 Forbidden
        const traversalStatus = await new Promise<number>((resolve, reject) => {
          const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: '/../package.json',
            method: 'GET'
          }, (res) => {
            resolve(res.statusCode || 0);
          });
          req.on('error', reject);
          req.end();
        });
        expect(traversalStatus).toBe(403);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
