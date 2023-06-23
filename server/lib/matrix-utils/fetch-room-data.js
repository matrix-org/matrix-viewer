'use strict';

const assert = require('assert');

const urlJoin = require('url-join');
const { HTTPResponseError, fetchEndpointAsJson } = require('../fetch-endpoint');
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

const fetchPotentiallyMissingStateEvent = traceFunction(async function ({
  accessToken,
  roomId,
  stateEventType,
  abortSignal,
} = {}) {
  assert(accessToken);
  assert(roomId);
  assert(stateEventType);

  try {
    const { data } = await fetchEndpointAsJson(
      getStateEndpointForRoomIdAndEventType(roomId, stateEventType),
      {
        accessToken,
        abortSignal,
      }
    );
    return data;
  } catch (err) {
    const is404Error = err instanceof HTTPResponseError && err.response.status === 404;

    // Ignore 404 errors, because it just means that the room doesn't have that state
    // event (which is normal).
    if (!is404Error) {
      throw err;
    }
  }
});

// Unfortunately, we can't just get the event ID from the `/state?format=event`
// endpoint, so we have to do this trick. Related to
// https://github.com/matrix-org/synapse/issues/15454
//
// TODO: Remove this when we have MSC3999 (because it's the only usage)
const removeMe_fetchRoomCreateEventId = traceFunction(async function (
  accessToken,
  roomId,
  { abortSignal } = {}
) {
  const { data } = await fetchEndpointAsJson(
    urlJoin(
      matrixServerUrl,
      `_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/messages?dir=f&limit1`
    ),
    {
      accessToken,
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
  const stateCreateResData = await fetchPotentiallyMissingStateEvent({
    accessToken: matrixAccessToken,
    roomId,
    stateEventType: 'm.room.create',
    abortSignal,
  });

  const roomCreationTs = stateCreateResData?.origin_server_ts;
  const predecessorRoomId = stateCreateResData?.content?.predecessor?.room_id;
  const predecessorLastKnownEventId = stateCreateResData?.content?.event_id;

  return { roomCreationTs, predecessorRoomId, predecessorLastKnownEventId };
});

const fetchPredecessorInfo = traceFunction(async function (
  matrixAccessToken,
  roomId,
  { abortSignal } = {}
) {
  const [roomCreationInfo, statePredecessorResData] = await Promise.all([
    fetchRoomCreationInfo(matrixAccessToken, roomId, { abortSignal }),
    fetchPotentiallyMissingStateEvent({
      accessToken: matrixAccessToken,
      roomId,
      stateEventType: 'org.matrix.msc3946.room_predecessor',
      abortSignal,
    }),
  ]);

  let predecessorRoomId;
  let predecessorLastKnownEventId;
  let predecessorViaServers;
  // Prefer the dynamic predecessor from the dedicated state event
  if (statePredecessorResData) {
    predecessorRoomId = statePredecessorResData?.content?.predecessor_room_id;
    predecessorLastKnownEventId = statePredecessorResData?.content?.last_known_event_id;
    predecessorViaServers = parseViaServersFromUserInput(
      statePredecessorResData?.content?.via_servers
    );
  }
  // Then fallback to the predecessor defined by the room creation event
  else if (roomCreationInfo) {
    ({ predecessorRoomId, predecessorLastKnownEventId } = roomCreationInfo);
  }

  const { roomCreationTs: currentRoomCreationTs } = roomCreationInfo;

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
  const stateTombstoneResData = await fetchPotentiallyMissingStateEvent({
    accessToken: matrixAccessToken,
    roomId,
    stateEventType: 'm.room.tombstone',
    abortSignal,
  });

  const successorRoomId = stateTombstoneResData?.content?.replacement_room;
  const successorSetTs = stateTombstoneResData?.origin_server_ts;

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
    stateNameResData,
    stateTopicResData,
    stateCanonicalAliasResData,
    stateAvatarResData,
    stateHistoryVisibilityResData,
    stateJoinRulesResData,
    predecessorInfo,
    successorInfo,
  ] = await Promise.all([
    fetchPotentiallyMissingStateEvent({
      accessToken: matrixAccessToken,
      roomId,
      stateEventType: 'm.room.name',
      abortSignal,
    }),
    fetchPotentiallyMissingStateEvent({
      accessToken: matrixAccessToken,
      roomId,
      stateEventType: 'm.room.topic',
      abortSignal,
    }),
    fetchPotentiallyMissingStateEvent({
      accessToken: matrixAccessToken,
      roomId,
      stateEventType: 'm.room.canonical_alias',
      abortSignal,
    }),
    fetchPotentiallyMissingStateEvent({
      accessToken: matrixAccessToken,
      roomId,
      stateEventType: 'm.room.avatar',
      abortSignal,
    }),
    fetchPotentiallyMissingStateEvent({
      accessToken: matrixAccessToken,
      roomId,
      stateEventType: 'm.room.history_visibility',
      abortSignal,
    }),
    fetchPotentiallyMissingStateEvent({
      accessToken: matrixAccessToken,
      roomId,
      stateEventType: 'm.room.join_rules',
      abortSignal,
    }),
    fetchPredecessorInfo(matrixAccessToken, roomId, { abortSignal }),
    fetchSuccessorInfo(matrixAccessToken, roomId, { abortSignal }),
  ]);

  let name = stateNameResData?.content?.name;
  let canonicalAlias = stateCanonicalAliasResData?.content?.alias;
  let topic = stateTopicResData?.content?.topic;
  let avatarUrl = stateAvatarResData?.content?.url;
  let historyVisibility = stateHistoryVisibilityResData?.content?.history_visibility;
  let joinRule = stateJoinRulesResData?.content?.join_rule;

  const {
    currentRoomCreationTs: roomCreationTs,
    predecessorRoomId,
    predecessorLastKnownEventId,
    predecessorViaServers,
  } = predecessorInfo;

  const { successorRoomId, successorSetTs } = successorInfo;

  return {
    id: roomId,
    name,
    topic,
    canonicalAlias,
    avatarUrl,
    historyVisibility,
    joinRule,
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
