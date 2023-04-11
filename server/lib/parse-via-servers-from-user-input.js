'use strict';

const StatusError = require('../lib/status-error');

function parseViaServersFromUserInput(rawViaServers) {
  // `rawViaServers` could be an array or a single string. Turn it into an array no matter what
  const rawViaServerList = [].concat(rawViaServers || []);
  if (rawViaServerList.length === 0) {
    return new Set();
  }

  const viaServerList = rawViaServerList.map((viaServer) => {
    // Sanity check to ensure that the via servers are strings (valid enough looking
    // host names)
    if (typeof viaServer !== 'string') {
      throw new StatusError(
        400,
        `?via server must be a string, got ${viaServer} (${typeof viaServer})`
      );
    }

    return viaServer;
  });

  // We use a `Set` to ensure that we don't have duplicate servers in the list
  return new Set(viaServerList);
}

module.exports = parseViaServersFromUserInput;
