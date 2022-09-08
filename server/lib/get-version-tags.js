'use strict';

const assert = require('assert');
const path = require('path');
const { readFile } = require('fs').promises;

const packageInfo = require('../../package.json');
assert(packageInfo.version);

async function getVersionTags() {
  let commit;
  let version;
  let versionDate;
  let packageVersion = packageInfo.version;
  try {
    [commit, version, versionDate] = await Promise.all([
      readFile(path.join(__dirname, '../../dist/GIT_COMMIT'), 'utf8'),
      readFile(path.join(__dirname, '../../dist/VERSION'), 'utf8'),
      readFile(path.join(__dirname, '../../dist/VERSION_DATE'), 'utf8'),
    ]);
  } catch (err) {
    console.warn('Unable to read version tags', err);
    commit = 'Not specified';
    version = 'Not specified';
    versionDate = 'Not specified';
  }

  return {
    commit: commit.trim(),
    version: version.trim(),
    versionDate: versionDate.trim(),
    packageVersion,
  };
}

module.exports = getVersionTags;
