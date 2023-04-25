'use strict';

const path = require('path').posix;
const manifest = require('../../dist/manifest.json');

function getFaviconAssetUrls() {
  const icoAssetPath = path.join('/', manifest['client/img/favicon.ico'].file);
  const svgAssetFile = path.join('/', manifest['client/img/favicon.svg'].file);

  return {
    ico: icoAssetPath,
    svg: svgAssetFile,
  };
}

module.exports = getFaviconAssetUrls;
