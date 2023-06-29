'use strict';

const assert = require('assert');

const urlJoin = require('url-join');
const { fetchEndpointAsJson } = require('../fetch-endpoint');
const parseViaServersFromUserInput = require('../parse-via-servers-from-user-input');
const { traceFunction } = require('../../tracing/trace-utilities');

const config = require('../config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

function getStateEndpointForRoomIdAndEventType(roomId, eventType) {
  return urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(
      eventType
    )}?format=event`
  );
}

// Unfortunately, we can't just get the event ID from the `/state?format=event`
// endpoint, so we have to do this trick. Related to
// https://github.com/matrix-org/synapse/issues/15454
//
// TODO: Remove this when we have MSC3999 (because it's the only usage)
const removeMe_fetchRoomCreateEventId = traceFunction(async function (
  matrixAccessToken,
  roomId,
  { abortSignal } = {}
) {
  const { data } = await fetchEndpointAsJson(
    urlJoin(
      matrixServerUrl,
      `_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/messages?dir=f&limit1`
    ),
    {
      accessToken: matrixAccessToken,
      abortSignal,
    }
  );

  const roomCreateEventId = data?.chunk?.[0]?.event_id;

  return roomCreateEventId;
});

const fetchRoomCreationInfo = traceFunction(async function (
  matrixAccessToken,
  roomId,
  { abortSignal } = {}
) {
  const [stateCreateResDataOutcome] = await Promise.allSettled([
    fetchEndpointAsJson(getStateEndpointForRoomIdAndEventType(roomId, 'm.room.create'), {
      accessToken: matrixAccessToken,
      abortSignal,
    }),
  ]);

  let roomCreationTs;
  let predecessorRoomId;
  let predecessorLastKnownEventId;
  if (stateCreateResDataOutcome.reason === undefined) {
    const { data } = stateCreateResDataOutcome.value;
    roomCreationTs = data?.origin_server_ts;
    predecessorLastKnownEventId = data?.content?.event_id;
    predecessorRoomId = data?.content?.predecessor?.room_id;
  }

  return { roomCreationTs, predecessorRoomId, predecessorLastKnownEventId };
});

const fetchPredecessorInfo = traceFunction(async function (
  matrixAccessToken,
  roomId,
  { abortSignal } = {}
) {
  const [roomCreationInfoOutcome, statePredecessorResDataOutcome] = await Promise.allSettled([
    fetchRoomCreationInfo(matrixAccessToken, roomId, { abortSignal }),
    fetchEndpointAsJson(
      getStateEndpointForRoomIdAndEventType(roomId, 'org.matrix.msc3946.room_predecessor'),
      {
        accessToken: matrixAccessToken,
        abortSignal,
      }
    ),
  ]);

  let predecessorRoomId;
  let predecessorLastKnownEventId;
  let predecessorViaServers;
  // Prefer the dynamic predecessor from the dedicated state event
  if (statePredecessorResDataOutcome.reason === undefined) {
    const { data } = statePredecessorResDataOutcome.value;
    predecessorRoomId = data?.content?.predecessor_room_id;
    predecessorLastKnownEventId = data?.content?.last_known_event_id;
    predecessorViaServers = parseViaServersFromUserInput(data?.content?.via_servers);
  }
  // Then fallback to the predecessor defined by the room creation event
  else if (roomCreationInfoOutcome.reason === undefined) {
    ({ predecessorRoomId, predecessorLastKnownEventId } = roomCreationInfoOutcome.value);
  }

  const { roomCreationTs: currentRoomCreationTs } = roomCreationInfoOutcome;

  return {
    // This is prefixed with "current" so we don't get this confused with the
    // predecessor room creation timestamp.
    currentRoomCreationTs,
    predecessorRoomId,
    predecessorLastKnownEventId,
    predecessorViaServers,
  };
});

const fetchSuccessorInfo = traceFunction(async function (
  matrixAccessToken,
  roomId,
  { abortSignal } = {}
) {
  const [stateTombstoneResDataOutcome] = await Promise.allSettled([
    fetchEndpointAsJson(getStateEndpointForRoomIdAndEventType(roomId, 'm.room.tombstone'), {
      accessToken: matrixAccessToken,
      abortSignal,
    }),
  ]);

  let successorRoomId;
  let successorSetTs;
  if (stateTombstoneResDataOutcome.reason === undefined) {
    const { data } = stateTombstoneResDataOutcome.value;
    successorRoomId = data?.content?.replacement_room;
    successorSetTs = data?.origin_server_ts;
  }

  return {
    successorRoomId,
    successorSetTs,
  };
});

// eslint-disable-next-line max-statements
const fetchRoomData = traceFunction(async function (
  matrixAccessToken,
  roomId,
  { abortSignal } = {}
) {
  assert(matrixAccessToken);
  assert(roomId);

  const [
    stateNameResDataOutcome,
    stateTopicResDataOutcome,
    stateCanonicalAliasResDataOutcome,
    stateAvatarResDataOutcome,
    stateHistoryVisibilityResDataOutcome,
    predecessorInfoOutcome,
    successorInfoOutcome,
  ] = await Promise.allSettled([
    fetchEndpointAsJson(getStateEndpointForRoomIdAndEventType(roomId, 'm.room.name'), {
      accessToken: matrixAccessToken,
      abortSignal,
    }),
    fetchEndpointAsJson(getStateEndpointForRoomIdAndEventType(roomId, 'm.room.topic'), {
      accessToken: matrixAccessToken,
      abortSignal,
    }),
    fetchEndpointAsJson(getStateEndpointForRoomIdAndEventType(roomId, 'm.room.canonical_alias'), {
      accessToken: matrixAccessToken,
      abortSignal,
    }),
    fetchEndpointAsJson(getStateEndpointForRoomIdAndEventType(roomId, 'm.room.avatar'), {
      accessToken: matrixAccessToken,
      abortSignal,
    }),
    fetchEndpointAsJson(
      getStateEndpointForRoomIdAndEventType(roomId, 'm.room.history_visibility'),
      {
        accessToken: matrixAccessToken,
        abortSignal,
      }
    ),
    fetchPredecessorInfo(matrixAccessToken, roomId, { abortSignal }),
    fetchSuccessorInfo(matrixAccessToken, roomId, { abortSignal }),
  ]);

  let name;
  if (stateNameResDataOutcome.reason === undefined) {
    const { data } = stateNameResDataOutcome.value;
    name = data?.content?.name;
  }

  let canonicalAlias;
  if (stateCanonicalAliasResDataOutcome.reason === undefined) {
    const { data } = stateCanonicalAliasResDataOutcome.value;
    canonicalAlias = data?.content?.alias;
  }

  let topic;
  if (stateTopicResDataOutcome.reason === undefined) {
    const { data } = stateTopicResDataOutcome.value;
    topic = data?.content?.topic;
  }

  let avatarUrl;
  if (stateAvatarResDataOutcome.reason === undefined) {
    const { data } = stateAvatarResDataOutcome.value;
    avatarUrl = data?.content?.url;
  }

  let historyVisibility;
  let historyVisibilityEventMeta;
  if (stateHistoryVisibilityResDataOutcome.reason === undefined) {
    const { data } = stateHistoryVisibilityResDataOutcome.value;
    historyVisibility = data?.content?.history_visibility;
    historyVisibilityEventMeta = {
      historyVisibility,
      sender: data?.sender,
      originServerTs: data?.origin_server_ts,
    };
  }

  let roomCreationTs;
  let predecessorRoomId;
  let predecessorLastKnownEventId;
  let predecessorViaServers;
  if (predecessorInfoOutcome.reason === undefined) {
    ({
      currentRoomCreationTs: roomCreationTs,
      predecessorRoomId,
      predecessorLastKnownEventId,
      predecessorViaServers,
    } = predecessorInfoOutcome.value);
  }
  let successorRoomId;
  let successorSetTs;
  if (successorInfoOutcome.reason === undefined) {
    ({ successorRoomId, successorSetTs } = successorInfoOutcome.value);
  }

  return {
    id: roomId,
    name,
    topic,
    canonicalAlias,
    avatarUrl,
    historyVisibility,
    historyVisibilityEventMeta,
    roomCreationTs,
    predecessorRoomId,
    predecessorLastKnownEventId,
    predecessorViaServers,
    successorRoomId,
    successorSetTs,
  };
});

module.exports = {
  fetchRoomData,
  fetchRoomCreationInfo,
  fetchPredecessorInfo,
  fetchSuccessorInfo,
  removeMe_fetchRoomCreateEventId,
};
