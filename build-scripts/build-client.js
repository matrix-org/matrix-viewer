'use strict';

const vite = require('vite');
const mergeOptions = require('merge-options');

const writeVersionFiles = require('./write-version-files');
const viteConfig = require('./vite.config');

async function buildClientScripts(extraConfig = {}) {
  await writeVersionFiles();

  const resultantViteConfig = mergeOptions(viteConfig, extraConfig);
  await vite.build(resultantViteConfig);
}

module.exports = buildClientScripts;
