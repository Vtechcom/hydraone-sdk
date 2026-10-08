#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../dist/cli/index.js');

if (fs.existsSync(distPath)) {
  const { runCli } = await import(pathToFileURL(distPath).href);
  await runCli();
} else {
  try {
    const srcPath = path.resolve(__dirname, '../src/cli/index.js');
    const { runCli } = await import(pathToFileURL(srcPath).href);
    await runCli();
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ERR_MODULE_NOT_FOUND') {
      console.error('Vui lòng chạy `pnpm run build` trước khi thực thi create-hydraone-game.');
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}
