'use strict';

const assert = require('assert');

const urlJoin = require('./lib/url-join');
const fetchEndpoint = require('./lib/fetch-endpoint');

const { matrixServerUrl } = require('../config.json');
assert(matrixServerUrl);

async function fetchEventsForTimestamp(roomId, ts) {
  assert(roomId);
  assert(ts);

  const timestampToEventEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/unstable/org.matrix.msc3030/rooms/${roomId}/timestamp_to_event?ts=${ts}&dir=f`
  );
  const timestampToEventResData = await fetchEndpoint(timestampToEventEndpoint);
  const eventIdForTimestamp = timestampToEventResData.event_id;
  assert(eventIdForTimestamp);

  const contextEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${roomId}/context/${eventIdForTimestamp}?limit=0`
  );
  const contextResData = await fetchEndpoint(contextEndpoint);
  //console.log('contextResData', contextResData);

  const messagesEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${roomId}/messages?from=${contextResData.start}&limit=50&filter={"lazy_load_members":true,"include_redundant_members":true}`
  );
  const messageResData = await fetchEndpoint(messagesEndpoint);

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
