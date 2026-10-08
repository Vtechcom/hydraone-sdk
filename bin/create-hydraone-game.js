#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../dist/cli/index.js');

if (fs.existsSync(distPath)) {
  const { runCli } = await import(distPath);
  await runCli();
} else {
  try {
    const { runCli } = await import('../src/cli/index.js');
    await runCli();
  } catch (err) {
    console.error('Vui lòng chạy `pnpm run build` trước khi thực thi create-hydraone-game.');
    process.exit(1);
  }
}
