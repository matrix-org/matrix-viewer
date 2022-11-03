'use strict';

const assert = require('assert');
const urlJoin = require('url-join');

const { fetchEndpointAsJson } = require('../fetch-endpoint');

const config = require('../config');
const StatusError = require('../status-error');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

async function ensureRoomJoined(accessToken, roomIdOrAlias, viaServers = []) {
  let qs = new URLSearchParams();
  [].concat(viaServers).forEach((viaServer) => {
    qs.append('server_name', viaServer);
  });

  const joinEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/join/${encodeURIComponent(roomIdOrAlias)}?${qs.toString()}`
  );
  try {
    const { data: joinData } = await fetchEndpointAsJson(joinEndpoint, {
      method: 'POST',
      accessToken,
    });
    assert(
      joinData.room_id,
      `Join endpoint (${joinEndpoint}) did not return \`room_id\` as expected. This is probably a problem with that homeserver.`
    );
    return joinData.room_id;
  } catch (err) {
    throw new StatusError(403, `Archiver is unable to join room: ${err.message}`);
  }
}

module.exports = ensureRoomJoined;
