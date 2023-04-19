'use strict';

const writeVersionFiles = require('./write-version-files');

async function build(extraConfig) {
  // Write the version files first because the Vite client build depends on the values
  await writeVersionFiles();

  // We have to require this after to make sure the version files are in place (built
  // from the step above)
  const buildClientScripts = require('./build-client-scripts');
  await buildClientScripts(extraConfig);
}

module.exports = build;
