'use strict';

const path = require('path');
const { mkdir, writeFile } = require('fs').promises;
const util = require('util');
const exec = util.promisify(require('child_process').exec);

async function mkdirp(path) {
  try {
    await mkdir(path, { recursive: true });
  } catch (err) {
    console.log('mkdirp err', err);
    // no-op, the directory is already created
  }
}

async function writeVersionFiles() {
  const commit = (await exec(`git rev-parse HEAD`)).stdout;
  const branch = (await exec(`git rev-parse --abbrev-ref HEAD`)).stdout;

  await mkdirp(path.join(__dirname, '../dist/'));
  await writeFile(path.join(__dirname, '../dist/GIT_COMMIT'), commit);
  await writeFile(path.join(__dirname, '../dist/VERSION'), branch);
  await writeFile(path.join(__dirname, '../dist/VERSION_DATE'), new Date().toISOString());
}

module.exports = writeVersionFiles;
