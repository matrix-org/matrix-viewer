'use strict';

const assert = require('assert');
const urlJoin = require('url-join');

const { fetchEndpointAsJson } = require('../fetch-endpoint');
const { traceFunction } = require('../../tracing/trace-utilities');

const config = require('../config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

async function timestampToEvent({ accessToken, roomId, ts, direction, abortSignal }) {
  assert(accessToken);
  assert(roomId);
  assert(ts);
  assert(direction);
  // TODO: Handle `fromCausalEventId` -> `org.matrix.msc3999.event_id`: See MSC3999
  // (https://github.com/matrix-org/matrix-spec-proposals/pull/3999)

  const timestampToEventEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/v1/rooms/${encodeURIComponent(
      roomId
    )}/timestamp_to_event?ts=${encodeURIComponent(ts)}&dir=${encodeURIComponent(direction)}`
  );
  const { data: timestampToEventResData } = await fetchEndpointAsJson(timestampToEventEndpoint, {
    accessToken,
    abortSignal,
  });

  return {
    eventId: timestampToEventResData.event_id,
    originServerTs: timestampToEventResData.origin_server_ts,
  };
}

module.exports = traceFunction(timestampToEvent);
