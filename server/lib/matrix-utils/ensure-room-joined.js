'use strict';

const assert = require('assert');
const urlJoin = require('url-join');

const { fetchEndpointAsJson } = require('../fetch-endpoint');
const getServerNameFromMatrixRoomIdOrAlias = require('./get-server-name-from-matrix-room-id-or-alias');

const config = require('../config');
const StatusError = require('../status-error');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

async function ensureRoomJoined(accessToken, roomIdOrAlias, viaServers = new Set()) {
  // We use a `Set` to ensure that we don't have duplicate servers in the list
  assert(viaServers instanceof Set);

  // Let's do our best for the user to join the room. Since room ID's are
  // unroutable on their own and won't be found if the server doesn't already
  // know about the room, we'll try to join the room via the server name that
  // we derived from the room ID or alias.
  const viaServersWithAssumptions = new Set(viaServers);
  const derivedServerName = getServerNameFromMatrixRoomIdOrAlias(roomIdOrAlias);
  if (derivedServerName) {
    viaServersWithAssumptions.add(derivedServerName);
  }

  let qs = new URLSearchParams();
  Array.from(viaServersWithAssumptions).forEach((viaServer) => {
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
