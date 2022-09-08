'use strict';

const buildClientScripts = require('./build-client-scripts');
const writeVersionFiles = require('./write-version-files');

async function build(extraConfig) {
  await Promise.all([writeVersionFiles(), buildClientScripts(extraConfig)]);
}

module.exports = build;
