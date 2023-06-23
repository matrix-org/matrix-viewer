'use strict';

const {
  VALID_ENTITY_DESCRIPTOR_TO_SIGIL_MAP,
} = require('matrix-public-archive-shared/lib/reference-values');
const resolveRoomAlias = require('./resolve-room-alias');

// Given a room ID or alias, return the room ID and the set of servers we should try to
// join from. Does not attempt to join the room.
async function resolveRoomIdOrAlias({
  accessToken,
  roomIdOrAlias,
  viaServers = new Set(),
  abortSignal,
} = {}) {
  const isRoomId = roomIdOrAlias.startsWith(VALID_ENTITY_DESCRIPTOR_TO_SIGIL_MAP.roomid);
  const isRoomAlias = roomIdOrAlias.startsWith(VALID_ENTITY_DESCRIPTOR_TO_SIGIL_MAP.r);

  if (isRoomId) {
    const roomId = roomIdOrAlias;
    return { roomId, viaServers };
  } else if (isRoomAlias) {
    const roomAlias = roomIdOrAlias;

    const { roomId, viaServers: moreViaServers } = await resolveRoomAlias({
      accessToken,
      roomAlias,
      abortSignal: abortSignal,
    });
    return { roomId, viaServers: new Set([...viaServers, ...moreViaServers]) };
  }

  throw new Error(
    `resolveRoomIdOrAlias: Unknown roomIdOrAlias=${roomIdOrAlias} does not start with valid sigil (${Object.values(
      VALID_ENTITY_DESCRIPTOR_TO_SIGIL_MAP
    )})`
  );
}

module.exports = resolveRoomIdOrAlias;
