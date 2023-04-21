import assert from 'assert';
import urlJoin from 'url-join';

import { DIRECTION } from 'matrix-public-archive-shared/lib/reference-values';
import { fetchEndpointAsJson } from '../fetch-endpoint';

import config from '../config';
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

  // We want to re-paginte over the same event so it's included in the response.
  //
  // When going backwards, that means starting using the paginatin token after the event
  // so we can see it looking backwards again.
  let paginationToken = contextResData.end;
  // When going forwards, that means starting using the paginatin token before the event
  // so we can see it looking forwards again.
  if (dir === DIRECTION.forward) {
    paginationToken = contextResData.start;
  }

  // Add `filter={"lazy_load_members":true}` to only get member state events for
  // the messages included in the response
  const messagesEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${encodeURIComponent(
      roomId
    )}/messages?dir=${dir}&from=${encodeURIComponent(
      paginationToken
    )}&limit=${limit}&filter={"lazy_load_members":true}`
  );
  const { data: messageResData } = await fetchEndpointAsJson(messagesEndpoint, {
    accessToken,
  });

  return messageResData;
}

export default getMessagesResponseFromEventId;
