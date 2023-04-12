'use strict';

const assert = require('assert');

// See https://spec.matrix.org/v1.5/appendices/#server-name
function getServerNameFromMatrixRoomIdOrAlias(roomIdOrAlias) {
  // `roomIdOrAlias` looks like `!foo:matrix.org` or `#foo:matrix.org` or even something
  // as crazy as `!foo:[1234:5678::abcd]:1234` where `[1234:5678::abcd]:1234` is the
  // server name part we're trying to parse out (see tests for more examples)
  assert(roomIdOrAlias);

  const pieces = roomIdOrAlias.split(':');
  // We can only derive the server name if there is a colon in the string. Since room
  // IDs are supposed to be treated as opaque strings, there is a future possibility
  // that they will not contain a colon.
  if (pieces.length < 2) {
    return null;
  }

  const servername = pieces.slice(1).join(':');

  return servername;
}

module.exports = getServerNameFromMatrixRoomIdOrAlias;
