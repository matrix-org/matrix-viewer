'use strict';

const assert = require('assert');
const urlJoin = require('url-join');

const StatusError = require('../errors/status-error');
const { fetchEndpointAsJson } = require('../fetch-endpoint');
const getServerNameFromMatrixRoomIdOrAlias = require('./get-server-name-from-matrix-room-id-or-alias');
const MatrixViewerURLCreator = require('matrix-viewer-shared/lib/url-creator');

const config = require('../config');
const basePath = config.get('basePath');
assert(basePath);
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);

const matrixViewerURLCreator = new MatrixViewerURLCreator(basePath);

async function ensureRoomJoined(
  accessToken,
  roomIdOrAlias,
  { viaServers = new Set(), abortSignal } = {}
) {
  // We use a `Set` to ensure that we don't have duplicate servers in the list
  assert(viaServers instanceof Set);

  // Let's do our best for the user to join the room. Since room ID's are
  // unroutable on their own and won't be found if the server doesn't already
  // know about the room, we'll try to join the room via the server name that
  // we derived from the room ID or alias.
  const viaServersWithAssumptions = new Set(viaServers);
  const derivedServerName = getServerNameFromMatrixRoomIdOrAlias(roomIdOrAlias);
  if (derivedServerName) {
    viaServersWithAssumptions.add(derivedServerName);
  }

  let qs = new URLSearchParams();
  Array.from(viaServersWithAssumptions).forEach((viaServer) => {
    qs.append('server_name', viaServer);
  });

  const joinEndpoint = urlJoin(
    matrixServerUrl,
    `_matrix/client/r0/join/${encodeURIComponent(roomIdOrAlias)}?${qs.toString()}`
  );
  try {
    const { data: joinData } = await fetchEndpointAsJson(joinEndpoint, {
      method: 'POST',
      accessToken,
      abortSignal,
      body: {
        reason:
          `Joining room to check history visibility. ` +
          `If your room is public with shared or world readable history visibility, ` +
          `it will be accessible on ${matrixViewerURLCreator.roomDirectoryUrl()}. ` +
          `See the FAQ for more details: ` +
          `https://github.com/matrix-org/matrix-viewer/blob/main/docs/faq.md#why-did-the-bot-join-my-room`,
      },
    });
    assert(
      joinData.room_id,
      `Join endpoint (${joinEndpoint}) did not return \`room_id\` as expected. This is probably a problem with that homeserver.`
    );
    return joinData.room_id;
  } catch (err) {
    throw new StatusError(403, `Bot is unable to join room: ${err.message}`);
  }
}

module.exports = ensureRoomJoined;
