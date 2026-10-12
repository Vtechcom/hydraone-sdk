import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'vue/index': 'src/vue/index.ts',
    'react/index': 'src/react/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  target: 'es2022',
  outDir: 'dist',
  external: ['vue', 'react', 'react-dom'],
  define: { __SDK_VERSION__: JSON.stringify(version) },
});
