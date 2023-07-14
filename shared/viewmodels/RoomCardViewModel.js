'use strict';

const { ViewModel } = require('hydrogen-view-sdk');

const assert = require('matrix-viewer-shared/lib/assert');
const MatrixViewerURLCreator = require('matrix-viewer-shared/lib/url-creator');

class RoomCardViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { room, basePath, homeserverUrlToPullMediaFrom, viaServers } = options;
    assert(room);
    assert(basePath);
    assert(homeserverUrlToPullMediaFrom);
    assert(viaServers);

    this._matrixViewerURLCreator = new MatrixViewerURLCreator(basePath);

    this._roomId = room.room_id;
    this._canonicalAlias = room.canonical_alias;
    this._name = room.name;
    this._mxcAvatarUrl = room.avatar_url;
    this._homeserverUrlToPullMediaFrom = homeserverUrlToPullMediaFrom;
    this._numJoinedMembers = room.num_joined_members;
    this._topic = room.topic;

    this._viaServers = viaServers;

    this._blockedBySafeSearch = false;
  }

  get roomId() {
    return this._roomId;
  }

  get canonicalAlias() {
    return this._canonicalAlias;
  }

  get name() {
    return this._name;
  }

  get mxcAvatarUrl() {
    return this._mxcAvatarUrl;
  }

  get homeserverUrlToPullMediaFrom() {
    return this._homeserverUrlToPullMediaFrom;
  }

  get numJoinedMembers() {
    return this._numJoinedMembers;
  }

  get topic() {
    return this._topic;
  }

  get roomUrl() {
    return this._matrixViewerURLCreator.roomUrl(this._canonicalAlias || this._roomId, {
      // Only include via servers when we have to fallback to the room ID
      viaServers: this._canonicalAlias ? undefined : this._viaServers,
    });
  }

  get blockedBySafeSearch() {
    return this._blockedBySafeSearch;
  }

  setBlockedBySafeSearch(blockedBySafeSearch) {
    if (blockedBySafeSearch !== this._blockedBySafeSearch) {
      this._blockedBySafeSearch = blockedBySafeSearch;
      this.emitChange('blockedBySafeSearch');
    }
  }
}

module.exports = RoomCardViewModel;
