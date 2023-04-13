'use strict';

const assert = require('assert');

const urlJoin = require('url-join');
const { fetchEndpointAsJson } = require('../fetch-endpoint');
const ensureRoomJoined = require('./ensure-room-joined');
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

// eslint-disable-next-line max-statements
async function fetchRoomData(matrixAccessToken, roomId) {
  assert(matrixAccessToken);
  assert(roomId);

  const mainFetchPromiseBundle = Promise.allSettled([
    fetchEndpointAsJson(getStateEndpointForRoomIdAndEventType(roomId, 'm.room.name'), {
      accessToken: matrixAccessToken,
    }),
    fetchEndpointAsJson(getStateEndpointForRoomIdAndEventType(roomId, 'm.room.canonical_alias'), {
      accessToken: matrixAccessToken,
    }),
    fetchEndpointAsJson(getStateEndpointForRoomIdAndEventType(roomId, 'm.room.avatar'), {
      accessToken: matrixAccessToken,
    }),
    fetchEndpointAsJson(
      getStateEndpointForRoomIdAndEventType(roomId, 'm.room.history_visibility'),
      {
        accessToken: matrixAccessToken,
      }
    ),
    fetchEndpointAsJson(getStateEndpointForRoomIdAndEventType(roomId, 'm.room.join_rules'), {
      accessToken: matrixAccessToken,
    }),
    fetchEndpointAsJson(getStateEndpointForRoomIdAndEventType(roomId, 'm.room.tombstone'), {
      accessToken: matrixAccessToken,
    }),
  ]);

  const predecessorInfoPromise = (async () => {
    const [stateCreateResDataOutcome, statePredecessorResDataOutcome] = await Promise.allSettled([
      fetchEndpointAsJson(getStateEndpointForRoomIdAndEventType(roomId, 'm.room.create'), {
        accessToken: matrixAccessToken,
      }),
      fetchEndpointAsJson(
        getStateEndpointForRoomIdAndEventType(roomId, 'org.matrix.msc3946.room_predecessor'),
        {
          accessToken: matrixAccessToken,
        }
      ),
    ]);

    let predecessorRoomId;
    let predecessorViaServers;
    if (statePredecessorResDataOutcome.reason === undefined) {
      const { data } = statePredecessorResDataOutcome.value;
      predecessorRoomId = data?.content?.predecessor_room_id;
      predecessorViaServers = parseViaServersFromUserInput(data?.content?.via_servers);
    } else if (stateCreateResDataOutcome.reason === undefined) {
      const { data } = stateCreateResDataOutcome.value;
      predecessorRoomId = data?.content?.predecessor?.room_id;
    }

    let roomCreationTs;
    if (stateCreateResDataOutcome.reason === undefined) {
      const { data } = stateCreateResDataOutcome.value;
      roomCreationTs = data?.origin_server_ts;
    }

    return {
      roomCreationTs,
      predecessorRoomId,
      predecessorViaServers,
    };
  })();

  // TODO: This is pretty ugly/messy. Refactor this and maybe use a different pattern
  // for this type of thing.
  const _getPredecessorRoomTombstoneSetTs = async () => {
    const { predecessorRoomId, predecessorViaServers } = await predecessorInfoPromise;

    if (predecessorRoomId) {
      await ensureRoomJoined(matrixAccessToken, predecessorRoomId, predecessorViaServers);

      // Fetch the tombstone from the predessor room
      const [predecessorStateTombstoneResDataOutcome] = await Promise.allSettled([
        fetchEndpointAsJson(
          getStateEndpointForRoomIdAndEventType(predecessorRoomId, 'm.room.tombstone'),
          {
            accessToken: matrixAccessToken,
          }
        ),
      ]);

      let predecessorSuccessorRoomId;
      let predecessorSuccessorSetTs;
      if (predecessorStateTombstoneResDataOutcome.reason === undefined) {
        const { data } = predecessorStateTombstoneResDataOutcome.value;
        predecessorSuccessorRoomId = data?.content?.replacement_room;
        predecessorSuccessorSetTs = data?.origin_server_ts;
      }

      // Make sure the the room that the predecessor specifies as the replacement room
      // is the same as what the current room is. This is a good signal that the rooms
      // are a true continuation of each other and the room admins agree.
      if (predecessorSuccessorRoomId === roomId) {
        return predecessorSuccessorSetTs;
      }

      return null;
    }

    return null;
  };

  // Memoize this function so we only ever do the extra work once
  let _predecessorRoomTombstoneSetTsResult;
  const getPredecessorRoomTombstoneSetTs = async () => {
    if (_predecessorRoomTombstoneSetTsResult === undefined) {
      _predecessorRoomTombstoneSetTsResult = _getPredecessorRoomTombstoneSetTs();
    }

    return _predecessorRoomTombstoneSetTsResult;
  };

  const [
    stateNameResDataOutcome,
    stateCanonicalAliasResDataOutcome,
    stateAvatarResDataOutcome,
    stateHistoryVisibilityResDataOutcome,
    stateJoinRulesResDataOutcome,
    stateTombstoneResDataOutcome,
  ] = await mainFetchPromiseBundle;

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

  let avatarUrl;
  if (stateAvatarResDataOutcome.reason === undefined) {
    const { data } = stateAvatarResDataOutcome.value;
    avatarUrl = data?.content?.url;
  }

  let historyVisibility;
  if (stateHistoryVisibilityResDataOutcome.reason === undefined) {
    const { data } = stateHistoryVisibilityResDataOutcome.value;
    historyVisibility = data?.content?.history_visibility;
  }

  let joinRule;
  if (stateJoinRulesResDataOutcome.reason === undefined) {
    const { data } = stateJoinRulesResDataOutcome.value;
    joinRule = data?.content?.join_rule;
  }

  const { roomCreationTs, predecessorRoomId, predecessorViaServers } = await predecessorInfoPromise;

  let successorRoomId;
  let successorSetTs;
  if (stateTombstoneResDataOutcome.reason === undefined) {
    const { data } = stateTombstoneResDataOutcome.value;
    successorRoomId = data?.content?.replacement_room;
    successorSetTs = data?.origin_server_ts;
  }

  return {
    id: roomId,
    name,
    canonicalAlias,
    avatarUrl,
    historyVisibility,
    joinRule,
    roomCreationTs,
    predecessorRoomId,
    predecessorViaServers,
    getPredecessorRoomTombstoneSetTs,
    successorRoomId,
    successorSetTs,
  };
}

module.exports = traceFunction(fetchRoomData);
