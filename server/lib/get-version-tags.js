'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const packageInfo = require('../../package.json');
assert(packageInfo.version);

const packageVersion = packageInfo.version;

function readVersionFileSync(path) {
  try {
    return fs.readFileSync(path, 'utf8').trim();
  } catch (err) {
    console.warn(`Unable to read version tags path=${path}`, err);
    return null;
  }
}

const assetTag = readVersionFileSync(path.join(__dirname, '../../dist/ASSET_TAG'), 'utf8');
const commit = readVersionFileSync(path.join(__dirname, '../../dist/GIT_COMMIT'), 'utf8');
const version = readVersionFileSync(path.join(__dirname, '../../dist/VERSION'), 'utf8');
const versionDate = readVersionFileSync(path.join(__dirname, '../../dist/VERSION_DATE'), 'utf8');

function getVersionTags() {
  return {
    assetTag,
    commit,
    version,
    versionDate,
    packageVersion,
  };
}

module.exports = getVersionTags;
