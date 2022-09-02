'use strict';

// We can remove this once https://github.com/vitejs/vite/pull/7047 lands
// and migrate back to a normal `vite.config.js` and what we had before.
//
// Related issues:
//  - https://github.com/vitejs/vite/issues/4530
//  - https://github.com/vitejs/vite/discussions/1736

const path = require('path');
const vite = require('vite');
const mergeOptions = require('merge-options');

const generateViteConfigForEntryPoint = require('./generate-vite-config-for-entry-point');

const entryPoints = [
  path.resolve(__dirname, '../public/js/entry-client-hydrogen.js'),
  path.resolve(__dirname, '../public/js/entry-client-room-directory.js'),
];

async function buildClientScripts(extraConfig = {}) {
  for (const entryPoint of entryPoints) {
    // Build the client-side JavaScript bundle when we see any changes
    const viteConfig = mergeOptions(generateViteConfigForEntryPoint(entryPoint), extraConfig);
    console.log('viteConfig', viteConfig);
    await vite.build(viteConfig);
  }
}

module.exports = buildClientScripts;
