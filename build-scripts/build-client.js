'use strict';

const vite = require('vite');
const mergeOptions = require('merge-options');

// Require the config before the Vite config so `process.env.NODE_ENV` is set
require('../server/lib/config');

const writeVersionFiles = require('./write-version-files');
const viteConfig = require('./vite.config');

async function buildClient(extraConfig = {}) {
  await writeVersionFiles();

  const resultantViteConfig = mergeOptions(viteConfig, extraConfig);
  await vite.build(resultantViteConfig);
}

module.exports = buildClient;
