'use strict';

const assert = require('assert');
const urlJoin = require('url-join');

const { fetchEndpointAsJson } = require('../fetch-endpoint');

const config = require('../config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

async function getMessagesResponseFromEventId({ accessToken, roomId, eventId, dir, limit }) {
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
    `_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/context/${encodeURIComponent(
      eventId
    )}?limit=0&filter={"lazy_load_members":true}`
  );
  const { data: contextResData } = await fetchEndpointAsJson(contextEndpoint, {
    accessToken,
  });

  // Add `filter={"lazy_load_members":true}` to only get member state events for
  // the messages included in the response
  const messagesEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${encodeURIComponent(
      roomId
    )}/messages?dir=${dir}&from=${encodeURIComponent(
      contextResData.end
    )}&limit=${limit}&filter={"lazy_load_members":true}`
  );
  const { data: messageResData } = await fetchEndpointAsJson(messagesEndpoint, {
    accessToken,
  });

  return messageResData;
}

module.exports = getMessagesResponseFromEventId;
