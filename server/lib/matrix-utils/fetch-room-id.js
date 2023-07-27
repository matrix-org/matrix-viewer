'use strict';

const assert = require('assert');
const urlJoin = require('url-join');

const StatusError = require('../errors/status-error');
const { fetchEndpointAsJson } = require('../fetch-endpoint');

const config = require('../config');
const basePath = config.get('basePath');
assert(basePath);
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

config.defaults({
  "enableAllowlist": false,
  "roomAllowlist": [],
});

async function fetchRoomId(
  roomIdOrAlias,
) {
  if (roomIdOrAlias.startsWith("!")) {
    return roomIdOrAlias;
  }

  const resolveEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/v3/directory/room/${encodeURIComponent(roomIdOrAlias)}`
  );
  try {
    const { data: roomData } = await fetchEndpointAsJson(resolveEndpoint, {
      method: 'GET',
    });
    assert(
      roomData.room_id,
      `Alias resolve endpoint (${resolveEndpoint}) did not return \`room_id\` as expected. This is probably a problem with that homeserver.`
    );
    return roomData.room_id;
  } catch (err) {
    throw new StatusError(403, `Bot is unable to resolve alias of room: ${err.message}`);
  }
}

module.exports = fetchRoomId;
