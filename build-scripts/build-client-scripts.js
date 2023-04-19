'use strict';

const vite = require('vite');
const mergeOptions = require('merge-options');

const viteConfig = require('./vite.config');

async function buildClientScripts(extraConfig = {}) {
  const resultantViteConfig = mergeOptions(viteConfig, extraConfig);
  await vite.build(resultantViteConfig);
}

module.exports = buildClientScripts;
