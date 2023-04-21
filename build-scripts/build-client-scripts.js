// A way to build multiple Vite entrypoints

// We can remove this once Vite supports multiple entrypoints and
// https://github.com/vitejs/vite/pull/7047 lands. We can migrate back to a
// normal `vite.config.js` and what we had before.
//
// Related issues:
//  - https://github.com/vitejs/vite/issues/4530
//  - https://github.com/vitejs/vite/discussions/1736

import path from 'path';
import vite from 'vite';
import mergeOptions from 'merge-options';

import generateViteConfigForEntryPoint from './generate-vite-config-for-entry-point';

const entryPoints = [
  path.resolve(__dirname, '../public/js/entry-client-hydrogen.js'),
  path.resolve(__dirname, '../public/js/entry-client-room-directory.js'),
  path.resolve(__dirname, '../public/js/entry-client-room-alias-hash-redirect.js'),
];

async function buildClientScripts(extraConfig = {}) {
  for (const entryPoint of entryPoints) {
    // Build the client-side JavaScript bundle when we see any changes
    const viteConfig = mergeOptions(
      generateViteConfigForEntryPoint(entryPoint),
      // Since we're building multiple entryPoints, we don't want it to clear out for each one
      { build: { emptyOutDir: false } },
      extraConfig
    );
    await vite.build(viteConfig);
  }
}

module.exports = buildClientScripts;
