'use strict';

const path = require('path').posix;

let _faviconAssetUrls;
function getFaviconAssetUrls() {
  // Probably not that much overhead but only calculate this once
  if (_faviconAssetUrls) {
    return _faviconAssetUrls;
  }

  // Lazy-load the manifest so we only require it on first call hopefully after the Vite
  // client build completes. `require(...)` calls are cached so it should be fine to
  // look this up over and over.
  //
  // We have to disable this because it's built via the Vite client build.
  // eslint-disable-next-line n/no-missing-require, n/no-unpublished-require
  const manifest = require('../../dist/manifest.json');

  const icoAssetPath = path.join('/', manifest['client/img/favicon.ico'].file);
  const svgAssetFile = path.join('/', manifest['client/img/favicon.svg'].file);

  _faviconAssetUrls = {
    ico: icoAssetPath,
    svg: svgAssetFile,
  };
  return _faviconAssetUrls;
}

module.exports = getFaviconAssetUrls;
