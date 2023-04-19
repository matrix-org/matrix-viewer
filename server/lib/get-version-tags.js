'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const packageInfo = require('../../package.json');
assert(packageInfo.version);

const packageVersion = packageInfo.version;

function readFileSync(path) {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch (err) {
    console.warn(`Unable to read version tags path=${path}`, err);
    return null;
  }
}

const commit = readFileSync(path.join(__dirname, '../../dist/GIT_COMMIT'), 'utf8').trim();
const version = readFileSync(path.join(__dirname, '../../dist/VERSION'), 'utf8').trim();
const versionDate = readFileSync(path.join(__dirname, '../../dist/VERSION_DATE'), 'utf8').trim();

function getVersionTags() {
  return {
    commit,
    version,
    versionDate,
    packageVersion,
  };
}

module.exports = getVersionTags;
