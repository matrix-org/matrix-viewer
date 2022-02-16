'use strict';

const assert = require('assert');

const urlJoin = require('./lib/url-join');
const fetchEndpoint = require('./lib/fetch-endpoint');

const { matrixServerUrl } = require('../config.json');
assert(matrixServerUrl);

async function fetchRoomData(roomId) {
  const stateNameEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${roomId}/state/m.room.name`
  );
  const stateAvatarEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${roomId}/state/m.room.avatar`
  );

  const [stateNameResDataOutcome, stateAvatarResDataOutcome] = await Promise.allSettled([
    fetchEndpoint(stateNameEndpoint),
    fetchEndpoint(stateAvatarEndpoint),
  ]);

  let name;
  if (stateNameResDataOutcome.reason === undefined) {
    name = stateNameResDataOutcome.value.name;
  }

  let avatarUrl;
  if (stateAvatarResDataOutcome.reason === undefined) {
    avatarUrl = stateAvatarResDataOutcome.value.url;
  }

  return {
    id: roomId,
    name,
    avatarUrl,
  };
}

module.exports = fetchRoomData;
