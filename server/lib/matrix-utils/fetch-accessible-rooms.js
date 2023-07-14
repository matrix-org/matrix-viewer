'use strict';

const assert = require('assert');

const urlJoin = require('url-join');
const { DIRECTION } = require('matrix-viewer-shared/lib/reference-values');
const { fetchEndpointAsJson } = require('../fetch-endpoint');
const { traceFunction } = require('../../tracing/trace-utilities');

const config = require('../config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

// The number of requests we should make to try to fill the limit before bailing out
const NUM_MAX_REQUESTS = 10;

async function requestPublicRooms(
  accessToken,
  { server, searchTerm, paginationToken, limit, abortSignal } = {}
) {
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

  return publicRoomsRes;
}

// eslint-disable-next-line complexity, max-statements
async function fetchAccessibleRooms(
  accessToken,
  {
    server,
    searchTerm,
    // Direction is baked into the pagination token but we're unable to decipher it from
    // the opaque token, we also have to pass it in explicitly.
    paginationToken,
    direction = DIRECTION.forward,
    limit,
    abortSignal,
  } = {}
) {
  assert(accessToken);
  assert([DIRECTION.forward, DIRECTION.backward].includes(direction), 'direction must be [f|b]');

  // Based off of the matrix.org room directory, only 42% of rooms are world_readable,
  // which means our best bet to fill up the results to the limit is to request at least
  // 2.4 times as many. I've doubled and rounded it up to 5 times as many so we can have
  // less round-trips.
  const bulkPaginationLimit = Math.ceil(5 * limit);

  let accessibleRooms = [];

  let firstResponse;
  let lastResponse;

  let loopToken = paginationToken;
  let lastLoopToken;
  let continuationIndex;
  let currentRequestCount = 0;
  while (
    // Stop if we have reached the limit of rooms we want to fetch
    accessibleRooms.length < limit &&
    // And bail if we're already gone through a bunch of pages to try to fill the limit
    currentRequestCount < NUM_MAX_REQUESTS &&
    // And bail if we've reached the end of the pagination
    // Always do the first request
    (currentRequestCount === 0 ||
      // If we have a next token, we can do another request
      (currentRequestCount > 0 && loopToken))
  ) {
    const publicRoomsRes = await requestPublicRooms(accessToken, {
      server,
      searchTerm,
      paginationToken: loopToken,
      limit: bulkPaginationLimit,
      abortSignal,
    });
    lastLoopToken = loopToken;
    lastResponse = publicRoomsRes;

    if (currentRequestCount === 0) {
      firstResponse = publicRoomsRes;
    }

    // Get the token ready for the next loop
    loopToken =
      direction === DIRECTION.forward ? publicRoomsRes.next_batch : publicRoomsRes.prev_batch;

    const fetchedRooms = publicRoomsRes.chunk;
    const fetchedRoomsInDirection =
      direction === DIRECTION.forward ? fetchedRooms : fetchedRooms.reverse();

    // We only want to see world_readable rooms
    let index = 0;
    for (let room of fetchedRoomsInDirection) {
      if (room.world_readable) {
        if (direction === DIRECTION.forward) {
          accessibleRooms.push(room);
        } else if (direction === DIRECTION.backward) {
          accessibleRooms.unshift(room);
        } else {
          throw new Error(`Invalid direction: ${direction}`);
        }
      }

      if (accessibleRooms.length === limit && !continuationIndex) {
        continuationIndex = index;
      }

      // Stop after we've reached the limit
      if (accessibleRooms.length >= limit) {
        break;
      }

      index += 1;
    }

    currentRequestCount += 1;
  }

  // Back-track to get the perfect continuation point and show exactly the limit of
  // rooms in the grid.
  //
  // Alternatively, we could just not worry about and show more than the limit of rooms
  //
  // XXX: Since the room directory order is not stable, this is slightly flawed as the
  // results could have shifted slightly from when we made the last request to now but
  // we assume it's good enough.
  let nextPaginationToken;
  let prevPaginationToken;
  if (continuationIndex) {
    const publicRoomsRes = await requestPublicRooms(accessToken, {
      server,
      searchTerm,
      // Start from the last request
      paginationToken: lastLoopToken,
      // Then only go out as far out as the continuation index (the point when we filled
      // the limit)
      limit: continuationIndex + 1,
      abortSignal,
    });

    if (direction === DIRECTION.forward) {
      prevPaginationToken = firstResponse.prev_batch;
      nextPaginationToken = publicRoomsRes.next_batch;
    } else if (direction === DIRECTION.backward) {
      prevPaginationToken = publicRoomsRes.prev_batch;
      nextPaginationToken = firstResponse.next_batch;
    } else {
      throw new Error(`Invalid direction: ${direction}`);
    }
  } else {
    if (direction === DIRECTION.forward) {
      prevPaginationToken = firstResponse.prev_batch;
      nextPaginationToken = lastResponse.next_batch;
    } else if (direction === DIRECTION.backward) {
      prevPaginationToken = lastResponse.prev_batch;
      nextPaginationToken = firstResponse.next_batch;
    } else {
      throw new Error(`Invalid direction: ${direction}`);
    }
  }

  return {
    rooms: accessibleRooms,
    prevPaginationToken,
    nextPaginationToken,
  };
}

module.exports = traceFunction(fetchAccessibleRooms);
