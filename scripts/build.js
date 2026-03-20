const { build } = require('esbuild');
const path = require('path');
const fs = require('fs');

async function run() {
  const isWatch = process.argv.includes('--watch');

  const buildOptions = {
    entryPoints: ['packages/cli/src/cli.ts'],
    bundle: true,
    platform: 'node',
    outfile: 'packages/cli/dist/appprobe.js',
    format: 'cjs',
    sourcemap: true,
    packages: 'bundle', // external: ['commander', 'chalk', 'ora', '@anthropic-ai/sdk'] or better bundle everything except what's not needed?
    alias: {
      '@appprobe/core': path.resolve(__dirname, '../packages/core/src'),
      '@appprobe/skills': path.resolve(__dirname, '../packages/skills/src')
    },
    loader: {
      '.ts': 'ts'
    }
  };

  try {
    if (isWatch) {
      const context = await require('esbuild').context(buildOptions);
      await context.watch();
      console.log('Watching for changes...');
    } else {
      await build(buildOptions);
      console.log('Build successful: packages/cli/dist/appprobe.js');
    }
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

run();
