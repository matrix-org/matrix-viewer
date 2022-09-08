'use strict';

const assert = require('assert');
const urlJoin = require('url-join');

const { fetchEndpointAsJson } = require('../fetch-endpoint');

const config = require('../config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

async function ensureRoomJoined(accessToken, roomId, viaServers = []) {
  let qs = new URLSearchParams();
  [].concat(viaServers).forEach((viaServer) => {
    qs.append('server_name', viaServer);
  });

  const joinEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/join/${roomId}?${qs.toString()}`
  );
  await fetchEndpointAsJson(joinEndpoint, {
    method: 'POST',
    accessToken,
  });
}

module.exports = ensureRoomJoined;
