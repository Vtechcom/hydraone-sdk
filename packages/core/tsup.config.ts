import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'vue/index': 'src/vue/index.ts',
    'react/index': 'src/react/index.ts',
  },
  format: ['esm', 'cjs'],
  // tsup injects the deprecated `baseUrl` into its dts build, an error under TS 6.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  clean: true,
  sourcemap: true,
  splitting: false,
  target: 'es2022',
  outDir: 'dist',
  // esbuild drops module-level directives while bundling, so restore "use client" on the React entry.
  // Without it Next.js App Router rejects the hooks when the provider is imported from a Server Component.
  async onSuccess() {
    for (const file of ['dist/react/index.js', 'dist/react/index.cjs']) {
      const code = await readFile(file, 'utf8');
      if (!code.startsWith('"use client"')) {
        await writeFile(file, `"use client";\n${code}`);
      }
    }
  },
  external: ['vue', 'react', 'react-dom'],
  define: { __SDK_VERSION__: JSON.stringify(version) },
});
