'use strict';

const assert = require('assert');

const urlJoin = require('url-join');
const { fetchEndpointAsJson } = require('../fetch-endpoint');
const { traceFunction } = require('../../tracing/trace-utilities');

const config = require('../config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

async function fetchPublicRooms(
  accessToken,
  { server, searchTerm, paginationToken, limit, abortSignal } = {}
) {
  assert(accessToken);

  let qs = new URLSearchParams();
  if (server) {
    qs.append('server', server);
  }

  const publicRoomsEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/v3/publicRooms?${qs.toString()}`
  );

  const { data: publicRoomsRes } = await fetchEndpointAsJson(publicRoomsEndpoint, {
    method: 'POST',
    body: {
      include_all_networks: true,
      filter: {
        generic_search_term: searchTerm,
      },
      since: paginationToken,
      limit,
    },
    accessToken,
    abortSignal,
  });

  // We only want to see public or world_readable rooms in the archive. A room can be
  // world_readable without being public. For example someone might have an invite only
  // room where only privileged users are allowed to join and talk but anyone can view
  // the room.
  const accessibleRooms = publicRoomsRes.chunk.filter((room) => {
    return room.world_readable || room.join_rule === 'public';
  });

  return {
    rooms: accessibleRooms,
    nextPaginationToken: publicRoomsRes.next_batch,
    prevPaginationToken: publicRoomsRes.prev_batch,
  };
}

module.exports = traceFunction(fetchPublicRooms);
