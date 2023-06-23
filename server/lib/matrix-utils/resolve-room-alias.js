'use strict';

const assert = require('assert');
const urlJoin = require('url-join');

const { fetchEndpointAsJson } = require('../fetch-endpoint');
const { traceFunction } = require('../../tracing/trace-utilities');

const config = require('../config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

async function resolveRoomAlias({ accessToken, roomAlias, abortSignal }) {
  assert(accessToken);
  assert(roomAlias);

  // GET /_matrix/client/r0/directory/room/{roomAlias} -> { room_id, servers }
  const resolveRoomAliasEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/directory/room/${encodeURIComponent(roomAlias)}`
  );
  const { data: resolveRoomAliasResData } = await fetchEndpointAsJson(resolveRoomAliasEndpoint, {
    accessToken,
    abortSignal,
  });

  return {
    roomId: resolveRoomAliasResData.room_id,
    viaServers: new Set(resolveRoomAliasResData.servers || []),
  };
}

module.exports = traceFunction(resolveRoomAlias);
