import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const r = (p) => path.join(here, p);

await build({
  entryPoints: [r('entry.tsx')],
  outfile: r('dist/app.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  logLevel: 'info',
  alias: {
    'react-native': 'react-native-web',
    'expo-router': r('shims/expo-router.tsx'),
    '@react-native-async-storage/async-storage': r('shims/async-storage.ts'),
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.EXPO_PUBLIC_API_URL': '"http://demo.local"',
    __DEV__: 'false',
    global: 'window',
  },
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  tsconfig: path.join(here, '../tsconfig.json'),
});
