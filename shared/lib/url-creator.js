'use strict';

const urlJoin = require('url-join');

const assert = require('matrix-public-archive-shared/lib/assert');
const {
  DIRECTION,
  TIME_PRECISION_VALUES,
} = require('matrix-public-archive-shared/lib/reference-values');

function qsToUrlPiece(qs) {
  if (qs.toString()) {
    // We allow `$` to be unencoded in the query string because it's a valid character
    // in a Matrix event ID
    return `?${qs.toString().replace(/%24/g, '$')}`;
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

  roomDirectoryUrl({ searchTerm, homeserver, paginationToken, direction } = {}) {
    // You must provide both `paginationToken` and `direction` if either is defined
    if (paginationToken || direction) {
      assert(
        [DIRECTION.forward, DIRECTION.backward].includes(direction),
        'direction must be [f|b]'
      );
      assert(paginationToken);
    }

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
    if (direction) {
      qs.append('dir', direction);
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
    assert(Array.isArray(viaServers));
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
    assert(Array.isArray(viaServers));
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

    // Get the `23:20:04` part of it (TIME_PRECISION_VALUES.seconds)
    let urlTime = timePiece.split('.')[0];
    if (preferredPrecision === TIME_PRECISION_VALUES.minutes) {
      // We only want to replace the seconds part of the URL if its superfluous. `23:59:00`
      // does not convey more information than `23:59` so we can safely remove it if the
      // desired precision is in minutes.
      urlTime = urlTime.replace(/:00$/, '');
    }
    const shouldIncludeTimeInUrl = !!preferredPrecision;

    return `${urlJoin(
      this._basePath,
      `${urlPath}/date/${urlDate}${shouldIncludeTimeInUrl ? `T${urlTime}` : ''}`
    )}${qsToUrlPiece(qs)}`;
  }

  archiveJumpUrlForRoom(
    roomIdOrAlias,
    {
      dir,
      currentRangeStartTs,
      currentRangeEndTs,
      timelineStartEventId,
      timelineEndEventId,
      viaServers = [],
    }
  ) {
    assert(roomIdOrAlias);
    assert(dir);
    assert(typeof currentRangeStartTs === 'number');
    assert(typeof currentRangeEndTs === 'number');
    assert(Array.isArray(viaServers));
    // `timelineStartEventId` and `timelineEndEventId` are optional because the
    // timeline could be showing 0 events or we could be jumping with no knowledge of
    // what was shown before.

    let qs = new URLSearchParams();
    qs.append('dir', dir);
    qs.append('currentRangeStartTs', currentRangeStartTs);
    qs.append('currentRangeEndTs', currentRangeEndTs);
    if (timelineStartEventId) {
      qs.append('timelineStartEventId', timelineStartEventId);
    }
    if (timelineEndEventId) {
      qs.append('timelineEndEventId', timelineEndEventId);
    }
    [].concat(viaServers).forEach((viaServer) => {
      qs.append('via', viaServer);
    });

    const urlPath = this._getArchiveUrlPathForRoomIdOrAlias(roomIdOrAlias);

    return `${urlJoin(this._basePath, `${urlPath}/jump`)}${qsToUrlPiece(qs)}`;
  }
}

module.exports = URLCreator;
