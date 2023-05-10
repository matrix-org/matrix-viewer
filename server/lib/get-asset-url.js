'use strict';

const path = require('path').posix;

function getAssetUrl(inputAssetPath) {
  // Lazy-load the manifest so we only require it on first call hopefully after the Vite
  // client build completes. `require(...)` calls are cached so it should be fine to
  // look this up over and over.
  //
  // We have to disable the `no-missing-require` because the file is built via the Vite client build.
  // eslint-disable-next-line n/no-missing-require, n/no-unpublished-require
  const manfiest = require('../../dist/manifest.json');

  const assetEntry = manfiest[inputAssetPath];
  if (!assetEntry) {
    throw new Error(`Could not find asset with path "${inputAssetPath}" in \`dist/manifest.json\``);
  }

  const outputAssetPath = path.join('/', assetEntry.file);

  return outputAssetPath;
}

module.exports = getAssetUrl;
