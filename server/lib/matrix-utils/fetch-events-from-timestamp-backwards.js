'use strict';

const assert = require('assert');
const urlJoin = require('url-join');

const { fetchEndpointAsJson } = require('../fetch-endpoint');
const timestampToEvent = require('./timestamp-to-event');
const { traceFunction } = require('../../tracing/trace-utilities');

const config = require('../config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

// Find an event right ahead of where we are trying to look. Then paginate
// /messages backwards. This makes sure that we can get events for the day when
// the room started. And it ensures that the `/messages` backfill kicks in
// properly since it only works to fill in the gaps going backwards.
//
// Consider this scenario: dayStart(fromTs) <- msg1 <- msg2 <- msg3 <- dayEnd(toTs)
//  - ❌ If we start from dayStart and look backwards, we will find nothing.
//  - ❌ If we start from dayStart and look forwards, we will find msg1, but
//    federated backfill won't be able to paginate forwards
//  - ✅ If we start from dayEnd and look backwards, we will find msg3 and
//    federation backfill can paginate backwards
//  - ❌ If we start from dayEnd and look forwards, we will find nothing
//
// Returns events in reverse-chronological order.
async function fetchEventsFromTimestampBackwards({ accessToken, roomId, ts, limit }) {
  assert(accessToken);
  assert(roomId);
  assert(ts);
  // Synapse has a max `/messages` limit of 1000
  assert(
    limit <= 1000,
    'We can only get 1000 messages at a time from Synapse. If you need more messages, we will have to implement pagination'
  );

  const { eventId: eventIdForTimestamp } = await timestampToEvent({
    accessToken,
    roomId,
    ts,
    direction: 'b',
  });
  assert(eventIdForTimestamp);

  // We only use this endpoint to get a pagination token we can use with
  // `/messages`.
  //
  // We add `limit=0` here because we want to grab the pagination token right
  // (before/after) the event.
  //
  // Add `filter={"lazy_load_members":true}` so that this endpoint responds
  // without timing out by returning just the state for the sender of the
  // included event. Otherwise, the homeserver returns all state in the room at
  // that point in time which in big rooms, can be 100k member events that we
  // don't care about anyway. Synapse seems to timeout at about the ~5k state
  // event mark.
  const contextEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${roomId}/context/${eventIdForTimestamp}?limit=0&filter={"lazy_load_members":true}`
  );
  const contextResData = await fetchEndpointAsJson(contextEndpoint, {
    accessToken,
  });

  // Add `filter={"lazy_load_members":true}` to only get member state events for
  // the messages included in the response
  const messagesEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${roomId}/messages?dir=b&from=${contextResData.end}&limit=${limit}&filter={"lazy_load_members":true}`
  );
  const messageResData = await fetchEndpointAsJson(messagesEndpoint, {
    accessToken,
  });

  const stateEventMap = {};
  for (const stateEvent of messageResData.state || []) {
    if (stateEvent.type === 'm.room.member') {
      stateEventMap[stateEvent.state_key] = stateEvent;
    }
  }

  const chronologicalEvents = messageResData?.chunk?.reverse() || [];

  return {
    stateEventMap,
    events: chronologicalEvents,
  };
}

module.exports = traceFunction(fetchEventsFromTimestampBackwards);
