import buildClientScripts from './build-client-scripts';
import writeVersionFiles from './write-version-files';

async function build(extraConfig) {
  await Promise.all([writeVersionFiles(), buildClientScripts(extraConfig)]);
}

module.exports = build;
