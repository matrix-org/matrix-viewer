'use strict';

const urlJoin = require('url-join');

const assert = require('matrix-public-archive-shared/lib/assert');

function qsToUrlPiece(qs) {
  if (qs.toString()) {
    return `?${qs.toString()}`;
  } else {
    return '';
  }
}

class URLCreator {
  constructor(basePath) {
    this._basePath = basePath;
  }

  roomDirectoryUrl({ searchTerm, paginationToken } = {}) {
    let qs = new URLSearchParams();
    if (searchTerm) {
      qs.append('search', searchTerm);
    }
    if (paginationToken) {
      qs.append('page', paginationToken);
    }

    return `${this._basePath}${qsToUrlPiece(qs)}`;
  }

  permalinkForRoomId(roomId) {
    return `https://matrix.to/#/${roomId}`;
  }

  archiveUrlForRoom(roomId, { viaServers = [] } = {}) {
    assert(roomId);
    let qs = new URLSearchParams();
    [].concat(viaServers).forEach((viaServer) => {
      qs.append('via', viaServer);
    });

    return `${urlJoin(this._basePath, `${roomId}`)}${qsToUrlPiece(qs)}`;
  }

  archiveUrlForDate(roomId, date, { viaServers = [] } = {}) {
    assert(roomId);
    assert(date);

    let qs = new URLSearchParams();
    [].concat(viaServers).forEach((viaServer) => {
      qs.append('via', viaServer);
    });

    // Gives the date in YYYY/mm/dd format.
    // date.toISOString() -> 2022-02-16T23:20:04.709Z
    const urlDate = date.toISOString().split('T')[0].replaceAll('-', '/');

    return `${urlJoin(this._basePath, `${roomId}/date/${urlDate}`)}${qsToUrlPiece(qs)}`;
  }
}

module.exports = URLCreator;
