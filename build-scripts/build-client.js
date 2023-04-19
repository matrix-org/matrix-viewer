'use strict';

const writeVersionFiles = require('./write-version-files');
const buildClientScripts = require('./build-client-scripts');

async function build(extraConfig) {
  await Promise.all([writeVersionFiles(), buildClientScripts(extraConfig)]);
}

module.exports = build;
