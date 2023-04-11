'use strict';

const assert = require('assert');

const urlJoin = require('url-join');
const { fetchEndpointAsJson } = require('../fetch-endpoint');
const parseViaServersFromUserInput = require('../parse-via-servers-from-user-input');
const { traceFunction } = require('../../tracing/trace-utilities');

const config = require('../config');
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

// eslint-disable-next-line max-statements
async function fetchRoomData(accessToken, roomId) {
  assert(accessToken);
  assert(roomId);

  const stateCreateEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/m.room.create?format=event`
  );
  const stateNameEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/m.room.name?format=event`
  );
  const canoncialAliasEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${encodeURIComponent(
      roomId
    )}/state/m.room.canonical_alias?format=event`
  );
  const stateAvatarEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/m.room.avatar?format=event`
  );
  const stateHistoryVisibilityEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${encodeURIComponent(
      roomId
    )}/state/m.room.history_visibility?format=event`
  );
  const stateJoinRulesEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/m.room.join_rules?format=event`
  );

  const statePredecessorEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${encodeURIComponent(
      roomId
    )}/state/org.matrix.msc3946.room_predecessor?format=event`
  );
  const stateTombstoneEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/m.room.tombstone?format=event`
  );

  const [
    stateCreateResDataOutcome,
    stateNameResDataOutcome,
    stateCanonicalAliasResDataOutcome,
    stateAvatarResDataOutcome,
    stateHistoryVisibilityResDataOutcome,
    stateJoinRulesResDataOutcome,
    statePredecessorResDataOutcome,
    stateTombstoneResDataOutcome,
  ] = await Promise.allSettled([
    fetchEndpointAsJson(stateCreateEndpoint, {
      accessToken,
    }),
    fetchEndpointAsJson(stateNameEndpoint, {
      accessToken,
    }),
    fetchEndpointAsJson(canoncialAliasEndpoint, {
      accessToken,
    }),
    fetchEndpointAsJson(stateAvatarEndpoint, {
      accessToken,
    }),
    fetchEndpointAsJson(stateHistoryVisibilityEndpoint, {
      accessToken,
    }),
    fetchEndpointAsJson(stateJoinRulesEndpoint, {
      accessToken,
    }),
    fetchEndpointAsJson(statePredecessorEndpoint, {
      accessToken,
    }),
    fetchEndpointAsJson(stateTombstoneEndpoint, {
      accessToken,
    }),
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

  let roomCreationTs;
  if (stateCreateResDataOutcome.reason === undefined) {
    const { data } = stateCreateResDataOutcome.value;
    roomCreationTs = data?.origin_server_ts;
  }

  let predecessorRoomId;
  let predecessorSetTs;
  let predecessorViaServers;
  if (statePredecessorResDataOutcome.reason === undefined) {
    const { data } = statePredecessorResDataOutcome.value;
    predecessorRoomId = data?.content?.predecessor_room_id;
    predecessorSetTs = data?.origin_server_ts;
    predecessorViaServers = parseViaServersFromUserInput(data?.content?.via_servers);
  } else if (stateCreateResDataOutcome.reason === undefined) {
    const { data } = stateCreateResDataOutcome.value;
    predecessorRoomId = data?.content?.predecessor;
    predecessorSetTs = data?.origin_server_ts;
  }

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
    predecessorSetTs,
    successorRoomId,
    successorSetTs,
  };
}

module.exports = traceFunction(fetchRoomData);
