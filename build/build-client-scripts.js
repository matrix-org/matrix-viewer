'use strict';

// A way to build multiple Vite entrypoints

// We can remove this once Vite supports multiple entrypoints and
// https://github.com/vitejs/vite/pull/7047 lands. We can migrate back to a
// normal `vite.config.js` and what we had before.
//
// Related issues:
//  - https://github.com/vitejs/vite/issues/4530
//  - https://github.com/vitejs/vite/discussions/1736

const path = require('path');
const vite = require('vite');
const mergeOptions = require('merge-options');

const generateViteConfigForEntryPoint = require('./generate-vite-config-for-entry-point');
const writeVersionFiles = require('./write-version-files');

const entryPoints = [
  path.resolve(__dirname, '../public/js/entry-client-hydrogen.js'),
  path.resolve(__dirname, '../public/js/entry-client-room-directory.js'),
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

async function build(extraConfig) {
  await writeVersionFiles();
  await buildClientScripts(extraConfig);
}

module.exports = build;
