'use strict';

const {
  VALID_ENTITY_DESCRIPTOR_TO_SIGIL_MAP,
} = require('matrix-viewer-shared/lib/reference-values');

// http://view.matrix.org/r/some-room:matrix.org/date/2022/11/16T23:59:59?at=$xxx
function parseMatrixViewerUrlForRoom(roomUrl) {
  const urlObj = new URL(roomUrl);
  const urlPathname = urlObj.pathname;

  const [_match, roomIdOrAliasDescriptor, roomIdOrAliasUrlPart, urlDateTime] = urlPathname.match(
    /\/(r|roomid)\/(.*?)\/date\/(.*)/
  );

  const sigil = VALID_ENTITY_DESCRIPTOR_TO_SIGIL_MAP[roomIdOrAliasDescriptor];
  const roomIdOrAlias = `${sigil}${roomIdOrAliasUrlPart}`;

  const continueAtEvent = urlObj.searchParams.get('at');

  return {
    roomIdOrAliasUrlPart,
    roomIdOrAlias,
    urlDateTime,
    continueAtEvent,
  };
}

module.exports = parseMatrixViewerUrlForRoom;
