'use strict';

const path = require('path').posix;

// Lazy-load the manifest so we only require it on first call hopefully after the Vite
// client build completes.
let _manifest;
function getManifest() {
  if (_manifest) {
    return _manifest;
  }
  _manifest = require('../../dist/manifest.json');
}

function getFaviconAssetUrls() {
  const manifest = getManifest();
  const icoAssetPath = path.join('/', manifest['client/img/favicon.ico'].file);
  const svgAssetFile = path.join('/', manifest['client/img/favicon.svg'].file);

  return {
    ico: icoAssetPath,
    svg: svgAssetFile,
  };
}

module.exports = getFaviconAssetUrls;
