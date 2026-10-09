/**
 * HydraOne SDK Documentation Portal — Interactive Logic & Playground
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Navigation & Section Switcher
  const navLinks = document.querySelectorAll('.sidebar .nav-link');
  const sections = document.querySelectorAll('.doc-section');
  const sidebar = document.getElementById('sidebar');
  const menuToggle = document.getElementById('menu-toggle');

  function showSection(sectionId) {
    if (!sectionId) sectionId = 'overview';
    const targetEl = document.getElementById(sectionId);
    if (!targetEl) sectionId = 'overview';
    
    sections.forEach(sec => {
      sec.classList.remove('active');
      if (sec.id === sectionId) {
        sec.classList.add('active');
      }
    });

    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('data-section') === sectionId) {
        link.classList.add('active');
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Handle URL hash changes
  function handleHash() {
    const hash = window.location.hash.replace('#', '') || 'overview';
    showSection(hash);
  }

  window.addEventListener('hashchange', handleHash);
  handleHash();

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetSec = link.getAttribute('data-section');
      if (targetSec) {
        window.location.hash = targetSec;
        showSection(targetSec);
        if (window.innerWidth <= 860) {
          sidebar.classList.remove('open');
        }
      }
    });
  });

  // Mobile Menu Toggle
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && !menuToggle.contains(e.target) && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }
    });
  }

  // 2. Code Copy to Clipboard with Fallback
  const copyBtns = document.querySelectorAll('.copy-btn');
  copyBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const codeEl = btn.closest('.code-block-wrapper')?.querySelector('pre code');
      const textToCopy = btn.getAttribute('data-copy') || (codeEl ? codeEl.innerText : btn.parentElement.nextElementSibling?.innerText) || '';
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textToCopy);
        } else {
          const ta = document.createElement('textarea');
          ta.value = textToCopy;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        const originalText = btn.innerText;
        btn.innerText = 'Copied! ✓';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerText = originalText;
          btn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Không thể copy vào clipboard:', err);
      }
    });
  });

  // 3. Search Engine
  const searchInput = document.getElementById('doc-search');
  const searchResults = document.getElementById('search-results');

  const searchIndex = [
    { title: 'Tổng quan SDK & Kiến trúc', section: 'overview', desc: 'Giới thiệu về HydraOne SDK, NFRs, chỉ số hiệu năng và bảo mật.' },
    { title: 'Quickstart 15 phút', section: 'quickstart', desc: '5 bước từ cài đặt đến ký giao dịch Cardano đầu tiên.' },
    { title: 'create-hydraone-game CLI', section: 'scaffolding-cli', desc: 'Khởi tạo template Nuxt 3, Next.js, hoặc Phaser 3 cấu hình sẵn.' },
    { title: 'Kiến trúc PostMessage Bridge', section: 'architecture', desc: 'Giao thức truyền thông hai chiều, bắt tay handshake và correlationId.' },
    { title: 'Safari ITP & Storage Troubleshooting', section: 'safari-itp', desc: 'Xử lý lỗi chặn LocalStorage trên iOS, Host Storage Relay protocol.' },
    { title: 'WalletBridgeClient (Core)', section: 'api-core', desc: 'init, connect, getBalance, signTx, signData, submitTx, triggerHaptic.' },
    { title: 'Cardano Domain Utilities (/cardano)', section: 'api-cardano', desc: 'lovelaceToAda, adaToLovelace, parseAssetValue, CBOR decoder, Hex utils.' },
    { title: 'React & Next.js Hooks (/react)', section: 'api-react', desc: 'HydraOneProvider, useWallet, useHydraAuth, useHostStorage.' },
    { title: 'Vue 3 & Nuxt 3 Composables (/vue)', section: 'api-vue', desc: 'useWalletBridgeClient, useGameAuth.' },
    { title: 'Tích hợp Phaser 3 Game Engine', section: 'api-phaser', desc: 'Sử dụng SDK trong Phaser Scene canvas loop và event emitter.' },
    { title: 'Simulator DevTools (/simulator)', section: 'api-simulator', desc: 'MockBridgeHost sandbox, Floating DevTools UI widget.' },
    { title: 'Bridge Health Diagnostics (/diagnostics)', section: 'api-diagnostics', desc: 'checkBridgeHealth, tự kiểm tra iframe permissions và độ trễ.' },
    { title: 'Hệ thống Mã Lỗi (Error Codes)', section: 'error-codes', desc: 'ERR_HANDSHAKE_TIMEOUT, ERR_USER_REJECTED, ERR_STORAGE_RESTRICTED.' },
    { title: 'Interactive Live Playground', section: 'playground', desc: 'Thử nghiệm gọi hàm SDK mô phỏng trực tiếp trên trình duyệt.' }
  ];

  if (searchInput && searchResults) {
    // Focus search on '/' or 'Ctrl+K' / 'Cmd+K'
    document.addEventListener('keydown', (e) => {
      const isInput = document.activeElement && (
        ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) ||
        document.activeElement.isContentEditable
      );

      const isSlash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isInput;
      const isCmdK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';

      if (isSlash || isCmdK) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      } else if (e.key === 'Escape') {
        searchResults.classList.remove('active');
        searchInput.blur();
      }
    });

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      if (!query) {
        searchResults.classList.remove('active');
        searchResults.innerHTML = '';
        return;
      }

      const matches = searchIndex.filter(item => 
        item.title.toLowerCase().includes(query) || 
        item.desc.toLowerCase().includes(query) ||
        item.section.toLowerCase().includes(query)
      );

      if (matches.length === 0) {
        searchResults.innerHTML = '<div class="search-item"><div class="search-item-desc">Không tìm thấy kết quả phù hợp.</div></div>';
      } else {
        searchResults.innerHTML = matches.map(m => `
          <div class="search-item" data-section="${m.section}">
            <div class="search-item-title">${m.title}</div>
            <div class="search-item-desc">${m.desc}</div>
          </div>
        `).join('');

        searchResults.querySelectorAll('.search-item').forEach(el => {
          el.addEventListener('click', () => {
            const sec = el.getAttribute('data-section');
            if (sec) {
              window.location.hash = sec;
              showSection(sec);
              searchResults.classList.remove('active');
              searchInput.value = '';
            }
          });
        });
      }

      searchResults.classList.add('active');
    });

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.remove('active');
      }
    });
  }

  // 4. Interactive Live Playground
  const consoleEl = document.getElementById('pg-console');
  const itpToggle = document.getElementById('pg-itp-toggle');
  const rejectToggle = document.getElementById('pg-reject-toggle');
  const btnClear = document.getElementById('btn-pg-clear');

  const btnConnect = document.getElementById('btn-pg-connect');
  const btnBalance = document.getElementById('btn-pg-balance');
  const btnSignTx = document.getElementById('btn-pg-signtx');
  const btnSignData = document.getElementById('btn-pg-signdata');
  const btnStorage = document.getElementById('btn-pg-storage');
  const btnDiag = document.getElementById('btn-pg-diag');

  let isWalletConnected = false;
  const mockStorageMap = new Map();

  function logToConsole(message, type = 'info') {
    if (!consoleEl) return;
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] [${type.toUpperCase()}]: `;
    consoleEl.textContent += `\n${prefix}${message}`;
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (consoleEl) consoleEl.textContent = '// Console đã được làm sạch.';
    });
  }

  if (btnConnect) {
    btnConnect.addEventListener('click', () => {
      logToConsole('Đang kích hoạt quy trình kết nối ví CIP-30 (Handshake + Connect)...');
      
      setTimeout(() => {
        if (rejectToggle && rejectToggle.checked) {
          logToConsole('LỖI: WalletRejectedError [ERR_USER_REJECTED]: Người chơi đã bấm từ chối yêu cầu kết nối ví!', 'error');
          isWalletConnected = false;
          return;
        }

        isWalletConnected = true;
        const walletState = {
          address: 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer5pnz75xxcrzqf96k',
          networkId: 0,
          isConnected: true
        };
        logToConsole(`KẾT NỐI THÀNH CÔNG!\n${JSON.stringify(walletState, null, 2)}`, 'success');
      }, 300);
    });
  }

  if (btnBalance) {
    btnBalance.addEventListener('click', () => {
      if (!isWalletConnected) {
        logToConsole('CẢNH BÁO: Ví chưa kết nối. Vui lòng bấm "1. Connect Wallet" trước.', 'warn');
        return;
      }
      logToConsole('Truy vấn số dư: getBalance() & parseAssetValue()...');
      const balance = {
        lovelace: '1000000000',
        ada: '1000.000000 ADA',
        assets: {
          'asset1f79a6d8c...': '50 HYDRA_COIN',
          'asset2b8c9d1e...': '1 FOUNDER_PASS_NFT'
        }
      };
      logToConsole(`SỐ DƯ TÀI KHOẢN:\n${JSON.stringify(balance, null, 2)}`, 'success');
    });
  }

  if (btnSignTx) {
    btnSignTx.addEventListener('click', () => {
      if (!isWalletConnected) {
        logToConsole('CẢNH BÁO: Ví chưa kết nối. Vui lòng bấm "1. Connect Wallet" trước.', 'warn');
        return;
      }
      logToConsole('Gửi yêu cầu ký giao dịch: signTx(txCbor, false)...');
      setTimeout(() => {
        if (rejectToggle && rejectToggle.checked) {
          logToConsole('LỖI: WalletRejectedError [ERR_USER_REJECTED]: Người chơi hủy popup ký giao dịch.', 'error');
          return;
        }
        const witness = {
          type: 'CIP30_SIGN_TX_SUCCESS',
          witnessSetHex: 'a10081825820abcdef0123456789...58409876543210fedcba...',
          txHash: '0x3f5d91c8a14b29efb61234567890abcdef1234567890abcdef1234567890abcd'
        };
        logToConsole(`KÝ GIAO DỊCH THÀNH CÔNG!\n${JSON.stringify(witness, null, 2)}`, 'success');
      }, 400);
    });
  }

  if (btnSignData) {
    btnSignData.addEventListener('click', () => {
      if (!isWalletConnected) {
        logToConsole('CẢNH BÁO: Ví chưa kết nối. Vui lòng bấm "1. Connect Wallet" trước.', 'warn');
        return;
      }
      logToConsole('Ký thông điệp xác thực CIP-8: signData(address, "Đăng nhập HydraOne")...');
      setTimeout(() => {
        if (rejectToggle && rejectToggle.checked) {
          logToConsole('LỖI: WalletRejectedError [ERR_USER_REJECTED]: Từ chối ký thông điệp CIP-8.', 'error');
          return;
        }
        const sig = {
          signature: '845820a10123...5840f98e72...',
          key: 'a4010103272006215820abcdef...'
        };
        logToConsole(`CHỮ KÝ CIP-8 COSE HỢP LỆ:\n${JSON.stringify(sig, null, 2)}`, 'success');
      }, 300);
    });
  }

  if (btnStorage) {
    btnStorage.addEventListener('click', () => {
      const isItp = itpToggle && itpToggle.checked;
      logToConsole(`Kiểm tra phân tầng TieredStorage (Safari ITP = ${isItp ? 'BẬT' : 'TẮT'})...`);
      
      if (isItp) {
        logToConsole('[Tier 1] window.localStorage bị chặn: DOMException: The operation is insecure (Safari ITP detected)!', 'warn');
        logToConsole('[Tier 2] Chuyển tiếp tự động sang Host Storage Relay (PostMessage)...');
        mockStorageMap.set('hydraone:demo_game:session_jwt', 'mocked_jwt_token_over_relay');
        logToConsole('LƯU TRỮ HOST RELAY THÀNH CÔNG! Dữ liệu được bảo toàn an toàn trên Host Shell cha.', 'success');
      } else {
        logToConsole('[Tier 1] window.localStorage hoạt động bình thường (Direct access: 0.1ms).', 'success');
      }
    });
  }

  if (btnDiag) {
    btnDiag.addEventListener('click', () => {
      logToConsole('Đang khởi chạy bộ chẩn đoán tự động: checkBridgeHealth()...');
      setTimeout(() => {
        const isItp = itpToggle && itpToggle.checked;
        const report = {
          overallStatus: isItp ? 'WARN' : 'PASS',
          checks: [
            { name: 'Iframe Sandbox', status: 'PASS', details: 'allow-scripts & allow-same-origin detected' },
            { name: 'PostMessage Roundtrip', status: 'PASS', latencyMs: 14 },
            { name: 'Storage Access', status: isItp ? 'WARN' : 'PASS', details: isItp ? 'Host Storage Relay Active (ITP Handled)' : 'Direct LocalStorage OK' },
            { name: 'Cardano CIP-30 Extension', status: 'PASS', details: 'Bridge Host Ready' }
          ]
        };
        logToConsole(`KẾT QUẢ CHẨN ĐOÁN:\n${JSON.stringify(report, null, 2)}`, isItp ? 'warn' : 'success');
      }, 500);
    });
  }
});
