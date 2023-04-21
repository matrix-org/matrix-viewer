// https://spec.matrix.org/v1.1/appendices/#room-aliases
// - `#room_alias:domain`
// - `#room-alias:server/date/2022/10/27`
const BASIC_ROOM_ALIAS_REGEX = /^(#(?:[^/:]+):(?:[^/]+))/;

// Returns `true` if redirecting, otherwise `false`
function redirectIfRoomAliasInHash(matrixPublicArchiveURLCreator, redirectCallback) {
  function handleHashChange() {
    const pageHash = window.location.hash;

    const match = pageHash.match(BASIC_ROOM_ALIAS_REGEX);
    if (match) {
      const roomAlias = match[0];
      const newLocation = matrixPublicArchiveURLCreator.archiveUrlForRoom(roomAlias);
      console.log(`Saw room alias in hash, redirecting to newLocation=${newLocation}`);
      window.location = newLocation;
      if (redirectCallback) {
        redirectCallback();
      }
      return true;
    }

    return false;
  }

  const eventHandler = {
    handleEvent(e) {
      if (e.type === 'hashchange') {
        handleHashChange();
      }
    },
  };
  window.addEventListener('hashchange', eventHandler);

  // Handle the initial hash
  if (window.location) {
    return handleHashChange();
  }

  return false;
}

module.exports = redirectIfRoomAliasInHash;
