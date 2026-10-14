import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  // tsup injects the deprecated `baseUrl` into its dts build, an error under TS 6.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  clean: true,
  sourcemap: true,
  splitting: false,
  target: 'es2022',
  outDir: 'dist',
  external: ['@hydraone/sdk'],
});
