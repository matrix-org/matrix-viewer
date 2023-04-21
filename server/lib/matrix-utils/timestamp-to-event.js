import assert from 'assert';
import urlJoin from 'url-join';

import { fetchEndpointAsJson } from '../fetch-endpoint.js';
import { traceFunction } from '../../tracing/trace-utilities.js';

import config from '../config.js';
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

export default traceFunction(timestampToEvent);
