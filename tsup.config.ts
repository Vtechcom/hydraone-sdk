import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cardano/index': 'src/cardano/index.ts',
    'vue/index': 'src/vue/index.ts',
    'react/index': 'src/react/index.ts',
    'simulator/index': 'src/simulator/index.ts',
    'diagnostics/index': 'src/diagnostics/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  target: 'es2022',
  outDir: 'dist',
  external: ['vue', 'react', 'react-dom'],
});
