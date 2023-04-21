import buildClientScripts from './build-client-scripts.js';
import writeVersionFiles from './write-version-files.js';

async function build(extraConfig) {
  await Promise.all([writeVersionFiles(), buildClientScripts(extraConfig)]);
}

export default build;
