'use strict';

const assert = require('assert');
const path = require('path').posix;

const manifest = require('../../dist/manifest.json');

const entryPoints = Object.keys(manifest).filter((name) => {
  return manifest[name].isEntry;
});

function recurseManifestEntryName(entryName) {
  const entry = manifest[entryName];
  console.log('entry', entryName, entry);

  // css
  const styles = [];
  // imports
  const scripts = [];
  // imports, dynamicImports
  const preloadScripts = [];

  for (const importName of entry.imports || []) {
    scripts.push(path.join('/', importName));
    preloadScripts.push(path.join('/', importName));

    const {
      styles: moreStyles,
      scripts: moreScripts,
      preloadScripts: morePreloadScripts,
    } = recurseManifestEntryName(importName);

    styles.push(...moreStyles);
    scripts.push(...moreScripts);
    preloadScripts.push(...morePreloadScripts);
  }

  for (const dynamicImportName of entry.dynamicImports || []) {
    preloadScripts.push(path.join('/', dynamicImportName));

    const {
      styles: moreStyles,
      scripts: moreScripts,
      preloadScripts: morePreloadScripts,
    } = recurseManifestEntryName(dynamicImportName);

    styles.push(...moreStyles);
    scripts.push(...moreScripts);
    preloadScripts.push(...morePreloadScripts);
  }

  for (const cssName of entry.css || []) {
    styles.push(path.join('/', cssName));
  }

  return {
    // css
    styles,
    // imports
    scripts,
    // dynamicImports
    preloadScripts,
  };
}

function getDependenciesForEntryPointName(entryPointName) {
  assert(entryPointName);

  const entry = manifest[entryPointName];
  assert(
    entry.isEntry,
    `You must start with a valid entry point from the Vite manifest.json. Saw ${entryPointName} but the only entry points available are ${JSON.stringify(
      entryPoints,
      null,
      2
    )}`
  );

  const { styles, scripts, preloadScripts } = recurseManifestEntryName(entryPointName);

  return {
    // De-duplicate assets
    styles: Array.from(new Set(styles)),
    scripts: Array.from(new Set(scripts)),
    preloadScripts: Array.from(new Set(preloadScripts)),
  };
}

module.exports = getDependenciesForEntryPointName;
