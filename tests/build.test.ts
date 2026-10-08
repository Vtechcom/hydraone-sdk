import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

describe('Build Output Verification', () => {
  it('should generate ESM, CJS, and DTS files in dist directory', () => {
    const distPath = path.resolve(__dirname, '../dist');
    if (!fs.existsSync(distPath)) {
      execSync('pnpm run build', { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' });
    }
    expect(fs.existsSync(distPath)).toBe(true);

    const esmFile = path.join(distPath, 'index.js');
    const cjsFile = path.join(distPath, 'index.cjs');
    const dtsFile = path.join(distPath, 'index.d.ts');

    expect(fs.existsSync(esmFile)).toBe(true);
    expect(fs.existsSync(cjsFile)).toBe(true);
    expect(fs.existsSync(dtsFile)).toBe(true);

    const esmContent = fs.readFileSync(esmFile, 'utf-8');
    expect(esmContent).toContain('HydraBridgeError');
    expect(esmContent).toContain('SDK_VERSION');

    const cardanoEsm = path.join(distPath, 'cardano/index.js');
    const cardanoCjs = path.join(distPath, 'cardano/index.cjs');
    const cardanoDts = path.join(distPath, 'cardano/index.d.ts');

    expect(fs.existsSync(cardanoEsm)).toBe(true);
    expect(fs.existsSync(cardanoCjs)).toBe(true);
    expect(fs.existsSync(cardanoDts)).toBe(true);

    const cardanoEsmContent = fs.readFileSync(cardanoEsm, 'utf-8');
    expect(cardanoEsmContent).toContain('getTotalLovelace');
    expect(cardanoEsmContent).toContain('getAdaBalance');
    expect(cardanoEsmContent).toContain('getAssetQuantity');
    expect(cardanoEsmContent).toContain('stringToHex');
    expect(cardanoEsmContent).toContain('hexToString');

    const vueEsm = path.join(distPath, 'vue/index.js');
    const vueCjs = path.join(distPath, 'vue/index.cjs');
    const vueDts = path.join(distPath, 'vue/index.d.ts');

    expect(fs.existsSync(vueEsm)).toBe(true);
    expect(fs.existsSync(vueCjs)).toBe(true);
    expect(fs.existsSync(vueDts)).toBe(true);

    const vueEsmContent = fs.readFileSync(vueEsm, 'utf-8');
    expect(vueEsmContent).toContain('useWalletBridgeClient');
    expect(vueEsmContent).toContain('useGameAuth');
    expect(vueEsmContent).toContain('formatShortAddress');
    // Đảm bảo vue là external peer dependency, không bị đóng gói trực tiếp vào dist/vue/index.js
    expect(vueEsmContent).toMatch(/from ["']vue["']/);

    const reactEsm = path.join(distPath, 'react/index.js');
    const reactCjs = path.join(distPath, 'react/index.cjs');
    const reactDts = path.join(distPath, 'react/index.d.ts');

    expect(fs.existsSync(reactEsm)).toBe(true);
    expect(fs.existsSync(reactCjs)).toBe(true);
    expect(fs.existsSync(reactDts)).toBe(true);

    const reactEsmContent = fs.readFileSync(reactEsm, 'utf-8');
    expect(reactEsmContent).toContain('HydraOneProvider');
    expect(reactEsmContent).toContain('useWallet');
    expect(reactEsmContent).toContain('useHydraAuth');
    expect(reactEsmContent).toContain('useHostStorage');
    expect(reactEsmContent).toContain('formatShortAddress');
    // Đảm bảo react là external peer dependency, không bị đóng gói trực tiếp vào dist/react/index.js
    expect(reactEsmContent).toMatch(/from ["']react["']/);

    const simulatorEsm = path.join(distPath, 'simulator/index.js');
    const simulatorCjs = path.join(distPath, 'simulator/index.cjs');
    const simulatorDts = path.join(distPath, 'simulator/index.d.ts');

    expect(fs.existsSync(simulatorEsm)).toBe(true);
    expect(fs.existsSync(simulatorCjs)).toBe(true);
    expect(fs.existsSync(simulatorDts)).toBe(true);

    const simulatorEsmContent = fs.readFileSync(simulatorEsm, 'utf-8');
    expect(simulatorEsmContent).toContain('MockBridgeHost');
    expect(simulatorEsmContent).toContain('MockClientTransport');
    expect(simulatorEsmContent).toContain('encodeLovelaceToCbor');
    expect(simulatorEsmContent).toContain('DevToolsWidget');
    expect(simulatorEsmContent).toContain('mountDevTools');
    expect(simulatorEsmContent).toContain('SafariItpStorageSimulator');

    const diagnosticsEsm = path.join(distPath, 'diagnostics/index.js');
    const diagnosticsCjs = path.join(distPath, 'diagnostics/index.cjs');
    const diagnosticsDts = path.join(distPath, 'diagnostics/index.d.ts');

    expect(fs.existsSync(diagnosticsEsm)).toBe(true);
    expect(fs.existsSync(diagnosticsCjs)).toBe(true);
    expect(fs.existsSync(diagnosticsDts)).toBe(true);

    const diagnosticsEsmContent = fs.readFileSync(diagnosticsEsm, 'utf-8');
    expect(diagnosticsEsmContent).toContain('checkBridgeHealth');
    expect(diagnosticsEsmContent).toContain('checkIframeSandbox');
    expect(diagnosticsEsmContent).toContain('checkPostMessageLatency');
    expect(diagnosticsEsmContent).toContain('checkStorageHealth');

    expect(esmContent).toContain('checkBridgeHealth');

    const cliEsm = path.join(distPath, 'cli/index.js');
    const cliCjs = path.join(distPath, 'cli/index.cjs');
    const cliDts = path.join(distPath, 'cli/index.d.ts');

    expect(fs.existsSync(cliEsm)).toBe(true);
    expect(fs.existsSync(cliCjs)).toBe(true);
    expect(fs.existsSync(cliDts)).toBe(true);

    const cliEsmContent = fs.readFileSync(cliEsm, 'utf-8');
    expect(cliEsmContent).toContain('runCli');
    expect(cliEsmContent).toContain('scaffoldProject');
    expect(cliEsmContent).toContain('parseCliArgs');
  });
});
