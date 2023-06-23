'use strict';

const assert = require('assert');

const { HTTPResponseError } = require('../fetch-endpoint');
const ensureRoomJoined = require('./ensure-room-joined');

const JOIN_STATES = {
  unknown: 'unknown',
  joining: 'joining',
  joined: 'joined',
  failed: 'failed',
};
const joinStateValues = Object.values(JOIN_STATES);

// Optimistically use the Matrix API assuming you're already joined to the room or
// accessing a `world_readable` room that doesn't require joining. If we see a 403
// Forbidden, then try joining the room and retrying the API call.
//
// Usage: Call this once to first create a helper utility that will retry a given
// function appropriately.
function createRetryFnIfNotJoined(
  accessToken,
  roomIdOrAlias,
  { viaServers = new Set(), abortSignal } = {}
) {
  assert(accessToken);
  assert(roomIdOrAlias);
  // We use a `Set` to ensure that we don't have duplicate servers in the list
  assert(viaServers instanceof Set);

  let joinState = JOIN_STATES.unknown;
  let joinPromise = null;

  return async function retryFnIfNotJoined(fn) {
    assert(
      joinStateValues.includes(joinState),
      `Unexpected internal join state when using createRetryFnIfNotJoined(...) (joinState=${joinState}). ` +
        `This is a bug in the Matrix Public Archive. Please report`
    );

    if (joinState === JOIN_STATES.joining) {
      // Wait for the join to finish before trying
      await joinPromise;
    } else if (joinState === JOIN_STATES.failed) {
      // If we failed to join the room, then there is no way any other call is going
      // to succeed so just immediately return an error. We return `joinPromise`
      // which will resolve to the join error that occured
      return joinPromise;
    }

    try {
      return await Promise.resolve(fn());
    } catch (errFromFn) {
      const isForbiddenError =
        errFromFn instanceof HTTPResponseError && errFromFn.response.status === 403;

      // If we're in the middle of joining, try again
      if (joinState === JOIN_STATES.joining) {
        return await retryFnIfNotJoined(fn);
      }
      // Try joining the room if we see a 403 Forbidden error as we may just not
      // be part of the room yet. We can't distinguish between a room that has
      // banned us vs a room we haven't joined yet so we just try joining the
      // room in any case.
      else if (
        isForbiddenError &&
        // Only try joining if we haven't tried joining yet
        joinState === JOIN_STATES.unknown
      ) {
        joinState = JOIN_STATES.joining;
        joinPromise = ensureRoomJoined(accessToken, roomIdOrAlias, {
          viaServers,
          abortSignal,
        });

        try {
          await joinPromise;
          joinState = JOIN_STATES.joined;
          console.log('retryAfterJoin');
          return await retryFnIfNotJoined(fn);
        } catch (err) {
          console.log('FAILED retryAfterJoin');
          joinState = JOIN_STATES.failed;
          throw err;
        }
      }

      throw errFromFn;
    }
  };
}

module.exports = createRetryFnIfNotJoined;
