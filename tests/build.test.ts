import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Build Output Verification', () => {
  it('should generate ESM, CJS, and DTS files in dist directory', () => {
    const distPath = path.resolve(__dirname, '../dist');
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
  });
});
