'use strict';

const assert = require('assert');

const urlJoin = require('url-join');
const { fetchEndpointAsJson } = require('../fetch-endpoint');
const { traceFunction } = require('../../tracing/trace-utilities');

const config = require('../config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

async function fetchPublicRooms(accessToken, { server, limit } = {}) {
  assert(accessToken);

  let qs = new URLSearchParams();
  if (server) {
    qs.append('server', server);
  }
  if (limit) {
    qs.append('limit', limit);
  }

  const publicRoomsEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/v3/publicRooms?${qs.toString()}`
  );

  const publicRoomsRes = await fetchEndpointAsJson(publicRoomsEndpoint, {
    accessToken,
  });

  // We only want to see public rooms in the archive
  const accessibleRooms = publicRoomsRes.chunk.filter((room) => {
    // `room.world_readable` is also accessible here but we only use history
    // `world_readable` to determine search indexing.
    return room.join_rule === 'public';
  });

  return {
    rooms: accessibleRooms,
    nextPaginationToken: publicRoomsRes.next_batch,
    prevPaginationToken: publicRoomsRes.prev_batch,
  };
}

module.exports = traceFunction(fetchPublicRooms);
