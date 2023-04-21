const assert = require('assert');
const { traceFunction } = require('../../tracing/trace-utilities');

const { DIRECTION } = require('matrix-public-archive-shared/lib/reference-values');
const timestampToEvent = require('./timestamp-to-event');
const getMessagesResponseFromEventId = require('./get-messages-response-from-event-id');

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

  let eventIdForTimestamp;
  try {
    const { eventId } = await timestampToEvent({
      accessToken,
      roomId,
      ts,
      direction: DIRECTION.backward,
    });
    eventIdForTimestamp = eventId;
  } catch (err) {
    const allowedErrorCodes = [
      // Allow `404: Unable to find event xxx in direction x`
      // so we can just display an empty placeholder with no events.
      404,
    ];
    if (!allowedErrorCodes.includes(err?.response?.status)) {
      throw err;
    }
  }

  if (!eventIdForTimestamp) {
    return {
      stateEventMap: {},
      events: [],
    };
  }

  const messageResData = await getMessagesResponseFromEventId({
    accessToken,
    roomId,
    eventId: eventIdForTimestamp,
    // We go backwards because that's the direction that backfills events (Synapse
    // doesn't backfill in the forward direction)
    dir: DIRECTION.backward,
    limit,
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
