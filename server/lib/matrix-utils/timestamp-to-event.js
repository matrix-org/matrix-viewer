'use strict';

const assert = require('assert');
const urlJoin = require('url-join');

const { fetchEndpointAsJson } = require('../fetch-endpoint');
const { traceFunction } = require('../../tracing/trace-utilities');

const config = require('../config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

async function timestampToEvent({ accessToken, roomId, ts, direction }) {
  assert(accessToken);
  assert(roomId);
  assert(ts);
  assert(direction);

  const timestampToEventEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/v1/rooms/${encodeURIComponent(
      roomId
    )}/timestamp_to_event?ts=${encodeURIComponent(ts)}&dir=${encodeURIComponent(direction)}`
  );
  const { data: timestampToEventResData } = await fetchEndpointAsJson(timestampToEventEndpoint, {
    accessToken,
  });

  return {
    eventId: timestampToEventResData.event_id,
    originServerTs: timestampToEventResData.origin_server_ts,
  };
}

module.exports = traceFunction(timestampToEvent);
