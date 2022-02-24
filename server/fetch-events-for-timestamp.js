'use strict';

const assert = require('assert');
const urlJoin = require('url-join');

const { fetchEndpointAsJson } = require('./lib/fetch-endpoint');

const config = require('./lib/config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

async function fetchEventsForTimestamp(accessToken, roomId, ts) {
  assert(accessToken);
  assert(roomId);
  assert(ts);

  // TODO: Only join world_readable rooms
  const joinEndpoint = urlJoin(matrixServerUrl, `_matrix/client/r0/join/${roomId}`);
  await fetchEndpointAsJson(joinEndpoint, {
    method: 'POST',
    accessToken,
  });

  const timestampToEventEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/unstable/org.matrix.msc3030/rooms/${roomId}/timestamp_to_event?ts=${ts}&dir=b`
  );
  const timestampToEventResData = await fetchEndpointAsJson(timestampToEventEndpoint, {
    accessToken,
  });
  const eventIdForTimestamp = timestampToEventResData.event_id;
  assert(eventIdForTimestamp);
  console.log('eventIdForTimestamp', eventIdForTimestamp);

  const contextEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${roomId}/context/${eventIdForTimestamp}?limit=0`
  );
  const contextResData = await fetchEndpointAsJson(contextEndpoint, {
    accessToken,
  });
  //console.log('contextResData', contextResData);

  // Add filter={"lazy_load_members":true,"include_redundant_members":true} to get member state events included
  const messagesEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${roomId}/messages?from=${contextResData.start}&limit=50&filter={"lazy_load_members":true,"include_redundant_members":true}`
  );
  const messageResData = await fetchEndpointAsJson(messagesEndpoint, {
    accessToken,
  });

  //console.log('messageResData.state', messageResData.state);
  const stateEventMap = {};
  for (const stateEvent of messageResData.state || []) {
    if (stateEvent.type === 'm.room.member') {
      stateEventMap[stateEvent.state_key] = stateEvent;
    }
  }

  return {
    stateEventMap,
    events: messageResData.chunk,
  };
}

module.exports = fetchEventsForTimestamp;
