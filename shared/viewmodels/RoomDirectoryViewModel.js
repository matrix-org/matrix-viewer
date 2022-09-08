'use strict';

const { ViewModel, ObservableArray } = require('hydrogen-view-sdk');

const assert = require('matrix-public-archive-shared/lib/assert');

class RoomDirectoryViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { homeserverUrl, matrixPublicArchiveURLCreator, rooms } = options;
    assert(homeserverUrl);
    assert(matrixPublicArchiveURLCreator);
    assert(rooms);

    this._homeserverUrl = homeserverUrl;
    this._matrixPublicArchiveURLCreator = matrixPublicArchiveURLCreator;
    this._rooms = new ObservableArray(
      rooms.map((room) => {
        return {
          roomId: room.room_id,
          canonicalAlias: room.canonical_alias,
          name: room.name,
          mxcAvatarUrl: room.avatar_url,
          homeserverUrlToPullMediaFrom: homeserverUrl,
          numJoinedMembers: room.num_joined_members,
          topic: room.topic,
          archiveRoomUrl: matrixPublicArchiveURLCreator.archiveUrlForRoom(room.room_id),
        };
      })
    );
  }

  get homeserverUrl() {
    return this._homeserverUrl;
  }

  get roomDirectoryUrl() {
    return this._matrixPublicArchiveURLCreator.roomDirectoryUrl();
  }

  get rooms() {
    return this._rooms;
  }
}

module.exports = RoomDirectoryViewModel;
