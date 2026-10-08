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
  });
});
