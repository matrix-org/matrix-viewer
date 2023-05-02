'use strict';

const { ViewModel } = require('hydrogen-view-sdk');

const assert = require('matrix-public-archive-shared/lib/assert');
const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');

class RoomCardViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { room, basePath, homeserverUrlToPullMediaFrom, pageSearchParameters } = options;
    assert(room);
    assert(basePath);
    assert(homeserverUrlToPullMediaFrom);
    assert(pageSearchParameters);

    this._matrixPublicArchiveURLCreator = new MatrixPublicArchiveURLCreator(basePath);

    this._roomId = room.room_id;
    this._canonicalAlias = room.canonical_alias;
    this._name = room.name;
    this._mxcAvatarUrl = room.avatar_url;
    this._homeserverUrlToPullMediaFrom = homeserverUrlToPullMediaFrom;
    this._numJoinedMembers = room.num_joined_members;
    this._topic = room.topic;

    this._pageSearchParameters = pageSearchParameters;
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

  get archiveRoomUrl() {
    return this._matrixPublicArchiveURLCreator.archiveUrlForRoom(
      this._canonicalAlias || this._roomId,
      {
        // Only include via servers when we have to fallback to the room ID
        viaServers: this._canonicalAlias ? undefined : [this._pageSearchParameters.homeserver],
      }
    );
  }
}

module.exports = RoomCardViewModel;
