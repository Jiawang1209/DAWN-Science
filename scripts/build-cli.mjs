import { build } from 'esbuild'
await build({ entryPoints: ['src/cli.ts'], outfile: 'dist/cli/main.js', bundle: true,
  platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: true,
})
