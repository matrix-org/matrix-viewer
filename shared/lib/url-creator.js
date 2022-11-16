'use strict';

const urlJoin = require('url-join');

const assert = require('matrix-public-archive-shared/lib/assert');
const { TIME_PRECISION_VALUES } = require('matrix-public-archive-shared/lib/reference-values');

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

  permalinkForRoom(roomIdOrAlias) {
    // We don't `encodeURIComponent(...)` because the URL looks nicer without encoded things
    return `https://matrix.to/#/${roomIdOrAlias}`;
  }

  roomDirectoryUrl({ searchTerm, homeserver, paginationToken } = {}) {
    let qs = new URLSearchParams();
    if (searchTerm) {
      qs.append('search', searchTerm);
    }
    if (homeserver) {
      qs.append('homeserver', homeserver);
    }
    if (paginationToken) {
      qs.append('page', paginationToken);
    }

    return `${this._basePath}${qsToUrlPiece(qs)}`;
  }

  _getArchiveUrlPathForRoomIdOrAlias(roomIdOrAlias) {
    let urlPath;
    // We don't `encodeURIComponent(...)` because the URL looks nicer without encoded things
    if (roomIdOrAlias.startsWith('#')) {
      urlPath = `/r/${roomIdOrAlias.replace(/^#/, '')}`;
    } else if (roomIdOrAlias.startsWith('!')) {
      urlPath = `/roomid/${roomIdOrAlias.replace(/^!/, '')}`;
    } else {
      throw new Error(
        'URLCreator._getArchiveUrlPathForRoomIdOrAlias(...): roomIdOrAlias should start with # (alias) or ! (room ID)'
      );
    }

    return urlPath;
  }

  archiveUrlForRoom(roomIdOrAlias, { viaServers = [] } = {}) {
    assert(roomIdOrAlias);
    let qs = new URLSearchParams();
    [].concat(viaServers).forEach((viaServer) => {
      qs.append('via', viaServer);
    });

    const urlPath = this._getArchiveUrlPathForRoomIdOrAlias(roomIdOrAlias);

    return `${urlJoin(this._basePath, `${urlPath}`)}${qsToUrlPiece(qs)}`;
  }

  archiveUrlForDate(
    roomIdOrAlias,
    date,
    { preferredPrecision = null, viaServers = [], scrollStartEventId } = {}
  ) {
    assert(roomIdOrAlias);
    assert(date);
    // `preferredPrecision` is optional but if they gave a value, make sure it's something expected
    if (preferredPrecision) {
      assert(
        Object.values(TIME_PRECISION_VALUES).includes(preferredPrecision),
        `TimeSelectorViewModel: options.preferredPrecision must be one of ${JSON.stringify(
          Object.values(TIME_PRECISION_VALUES)
        )}`
      );
    }

    let qs = new URLSearchParams();
    [].concat(viaServers).forEach((viaServer) => {
      qs.append('via', viaServer);
    });
    if (scrollStartEventId) {
      qs.append('at', scrollStartEventId);
    }

    const urlPath = this._getArchiveUrlPathForRoomIdOrAlias(roomIdOrAlias);

    // Gives the date in YYYY/mm/dd format.
    // date.toISOString() -> 2022-02-16T23:20:04.709Z
    const [datePiece, timePiece] = date.toISOString().split('T');
    // Get the `2022/02/16` part of it
    const urlDate = datePiece.replaceAll('-', '/');

    // Get the `23:20:04` part of it
    let urlTime = timePiece.split('.')[0];
    if (preferredPrecision === TIME_PRECISION_VALUES.minutes) {
      urlTime = urlTime.replace(/:00$/, '');
    }
    const shouldIncludeTimeInUrl = !!preferredPrecision;

    return `${urlJoin(
      this._basePath,
      `${urlPath}/date/${urlDate}${shouldIncludeTimeInUrl ? `T${urlTime}` : ''}`
    )}${qsToUrlPiece(qs)}`;
  }

  archiveJumpUrlForRoom(roomIdOrAlias, { ts, dir }) {
    assert(roomIdOrAlias);
    assert(ts);
    assert(dir);

    let qs = new URLSearchParams();
    qs.append('ts', ts);
    qs.append('dir', dir);

    const urlPath = this._getArchiveUrlPathForRoomIdOrAlias(roomIdOrAlias);

    return `${urlJoin(this._basePath, `${urlPath}/jump`)}${qsToUrlPiece(qs)}`;
  }
}

module.exports = URLCreator;
