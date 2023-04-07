'use strict';

const {
  VALID_SIGIL_TO_ENTITY_DESCRIPTOR_MAP,
} = require('matrix-public-archive-shared/lib/reference-values');

// http://archive.matrix.org/r/some-room:matrix.org/date/2022/11/16T23:59:59?at=$xxx
function parseArchiveUrlForRoom(archiveUrlForRoom) {
  const urlObj = new URL(archiveUrlForRoom);
  const urlPathname = urlObj.pathname;

  // eslint-disable-next-line no-unused-vars -- It's more clear to leave `match` so we can see what we're destructuring from
  const [match, roomIdOrAliasDescriptor, roomIdOrAliasUrlPart, urlDateTime] = urlPathname.match(
    /\/(r|roomid)\/(.*?)\/date\/(.*)/
  );

  const [sigil] = Object.entries(VALID_SIGIL_TO_ENTITY_DESCRIPTOR_MAP).find(
    // eslint-disable-next-line no-unused-vars -- It's more clear to leave `sigil` so we can see what we're destructuring from
    ([sigil, entityDescriptor]) => roomIdOrAliasDescriptor === entityDescriptor
  );
  const roomIdOrAlias = `${sigil}${roomIdOrAliasUrlPart}`;

  const continueAtEvent = urlObj.searchParams.get('at');

  return {
    roomIdOrAliasUrlPart,
    roomIdOrAlias,
    urlDateTime,
    continueAtEvent,
  };
}

module.exports = parseArchiveUrlForRoom;
