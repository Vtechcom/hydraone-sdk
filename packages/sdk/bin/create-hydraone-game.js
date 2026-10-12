#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../dist/cli/index.js');

if (!existsSync(entry)) {
  console.error('create-hydraone-game: build output not found. Run `pnpm run build` first.');
  process.exit(1);
}

const { runCli } = await import(pathToFileURL(entry).href);
await runCli();
