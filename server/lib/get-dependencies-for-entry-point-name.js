'use strict';

const assert = require('assert');
const path = require('path').posix;

let _entryPoints;
function getEntryPoints() {
  // Probably not that much overhead but only calculate this once
  if (_entryPoints) {
    return _entryPoints;
  }

  // Lazy-load the manifest so we only require it on first call hopefully after the Vite
  // client build completes. `require(...)` calls are cached so it should be fine to
  // look this up over and over.
  //
  // We have to disable this because it's built via the Vite client build.
  // eslint-disable-next-line n/no-missing-require, n/no-unpublished-require
  const manifest = require('../../dist/manifest.json');

  _entryPoints = Object.keys(manifest).filter((name) => {
    return manifest[name].isEntry;
  });
  return _entryPoints;
}

// eslint-disable-next-line max-statements
function recurseManifestEntryName(entryName) {
  // Lazy-load the manifest so we only require it on first call hopefully after the Vite
  // client build completes. `require(...)` calls are cached so it should be fine to
  // look this up over and over.
  //
  // We have to disable this because it's built via the Vite client build.
  // eslint-disable-next-line n/no-missing-require, n/no-unpublished-require
  const manifest = require('../../dist/manifest.json');

  const entry = manifest[entryName];
  const entryFilePath = path.join('/', entry.file);

  // css
  const styles = [];
  // assets
  const fonts = [];
  const images = [];
  // imports
  const scripts = [entryFilePath];
  // imports, dynamicImports
  const preloadScripts = [entryFilePath];

  for (const importName of entry.imports || []) {
    const importFilePath = path.join('/', manifest[importName].file);
    scripts.push(importFilePath);
    preloadScripts.push(importFilePath);

    const {
      styles: moreStyles,
      fonts: moreFonts,
      images: moreImages,
      scripts: moreScripts,
      preloadScripts: morePreloadScripts,
    } = recurseManifestEntryName(importName);

    styles.push(...moreStyles);
    fonts.push(...moreFonts);
    images.push(...moreImages);
    scripts.push(...moreScripts);
    preloadScripts.push(...morePreloadScripts);
  }

  for (const dynamicImportName of entry.dynamicImports || []) {
    const dynamicImportFilePath = path.join('/', manifest[dynamicImportName].file);
    preloadScripts.push(dynamicImportFilePath);

    const {
      styles: moreStyles,
      fonts: moreFonts,
      images: moreImages,
      scripts: moreScripts,
      preloadScripts: morePreloadScripts,
    } = recurseManifestEntryName(dynamicImportName);

    styles.push(...moreStyles);
    fonts.push(...moreFonts);
    images.push(...moreImages);
    scripts.push(...moreScripts);
    preloadScripts.push(...morePreloadScripts);
  }

  for (const cssName of entry.css || []) {
    styles.push(path.join('/', cssName));
  }

  for (const assetName of entry.assets || []) {
    const assetFileExtension = path.extname(assetName);
    const assetFilePath = path.join('/', assetName);

    if (
      // We only care about preloading `.woff2` fonts since that is all of the major
      // browsers support them.
      ['.woff2'].includes(assetFileExtension) &&
      // We only care about a few variants that we will actually likely use on the page
      // (this may need to change over time).
      ['-Regular-', '-Bold-', '-SemiBold-'].some((variant) => assetName.includes(variant))
    ) {
      fonts.push(path.join('/', assetFilePath));
    } else if (
      // Preload a specific file we use on the room directory homepage
      assetName.includes('matrix-lines-hero')
      // We don't care about preloading *all* images at the moment because there are a
      // lot that we just don't use even though they are bundled because they are
      // referened in the CSS.
      //['.jpg', '.png', '.svg'].includes(assetFileExtension)
    ) {
      images.push(path.join('/', assetFilePath));
    }
  }

  return {
    // css
    styles,
    fonts,
    images,
    // imports
    scripts,
    // dynamicImports
    preloadScripts,
  };
}

// Look through the Vite manifest.json and return the dependencies for a given entry
function getDependenciesForEntryPointName(entryPointName) {
  assert(entryPointName);

  // Lazy-load the manifest so we only require it on first call hopefully after the Vite
  // client build completes. `require(...)` calls are cached so it should be fine to
  // look this up over and over.
  //
  // We have to disable this because it's built via the Vite client build.
  // eslint-disable-next-line n/no-missing-require, n/no-unpublished-require
  const manifest = require('../../dist/manifest.json');

  const entry = manifest[entryPointName];
  assert(
    entry.isEntry,
    `You must start with a valid entry point from the Vite manifest.json. Saw ${entryPointName} but the only entry points available are ${JSON.stringify(
      getEntryPoints(),
      null,
      2
    )}`
  );

  const { styles, fonts, images, scripts, preloadScripts } =
    recurseManifestEntryName(entryPointName);

  return {
    // De-duplicate assets
    styles: Array.from(new Set(styles)),
    fonts: Array.from(new Set(fonts)),
    images: Array.from(new Set(images)),
    scripts: Array.from(new Set(scripts)),
    preloadScripts: Array.from(new Set(preloadScripts)),
  };
}

module.exports = getDependenciesForEntryPointName;
