'use strict';

const assert = require('assert');

const urlJoin = require('url-join');
const { fetchEndpointAsJson } = require('../fetch-endpoint');
const { traceFunction } = require('../../tracing/trace-utilities');

const config = require('../config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

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

// eslint-disable-next-line complexity
async function fetchAccessibleRooms(
  accessToken,
  { server, searchTerm, paginationToken, limit, abortSignal } = {}
) {
  assert(accessToken);

  let accessibleRooms = [];
  let nextPaginationToken = paginationToken;
  let prevPaginationToken;

  let lastPaginationToken;
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
      (currentRequestCount > 0 && nextPaginationToken))
  ) {
    const publicRoomsRes = await requestPublicRooms(accessToken, {
      server,
      searchTerm,
      paginationToken: nextPaginationToken,
      // Based off of the matrix.org room directory, only 42% of rooms are world_readable,
      // which means our best bet to fill up the results to the limit is to request 2.5 times as many.
      limit: Math.ceil(2.5 * limit),
      abortSignal,
    });
    lastPaginationToken = nextPaginationToken;

    // We keep track prev_batch token from the first request only as we may be
    // paginating over many pages but to the client, it just appears like one they can
    // go back to.
    if (currentRequestCount === 0) {
      prevPaginationToken = publicRoomsRes.prev_batch;
    }

    // Keep track of this as we go. For the final pagination token, we return to the
    // client, we might need to back-track later to get the perfect continuation point
    // if we find more than the limit of rooms we want to fetch. Alternatively, we could
    // just not worry about and show more than the limit of rooms.
    nextPaginationToken = publicRoomsRes.next_batch;

    // We only want to see world_readable rooms in the archive
    let index = 0;
    for (let room of publicRoomsRes.chunk) {
      if (room.world_readable) {
        accessibleRooms.push(room);
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

  // XXX: Since the room directory order is not stable, this is slightly flawed as the
  // results could have shifted slightly from when we made the last request to get the
  // `continuationIndex` to now when we're trying to get the actual token to continue
  // seamlessly.
  //
  // Alternatively, we could just not worry about and show more than the limit of rooms
  if (continuationIndex) {
    const publicRoomsRes = await requestPublicRooms(accessToken, {
      server,
      searchTerm,
      // Start from the beginning of the last request
      paginationToken: lastPaginationToken,
      // Then go out only as far as the continuation index (the point when we filled the limit)
      limit: continuationIndex + 1,
      abortSignal,
    });

    nextPaginationToken = publicRoomsRes.next_batch;
  }

  return {
    rooms: accessibleRooms,
    nextPaginationToken,
    prevPaginationToken,
  };
}

module.exports = traceFunction(fetchAccessibleRooms);
