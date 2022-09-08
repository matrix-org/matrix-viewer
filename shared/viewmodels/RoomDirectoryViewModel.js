'use strict';

const { ViewModel, ObservableArray } = require('hydrogen-view-sdk');

const assert = require('matrix-public-archive-shared/lib/assert');

class RoomDirectoryViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const {
      homeserverUrl,
      matrixPublicArchiveURLCreator,
      rooms,
      nextPaginationToken,
      prevPaginationToken,
    } = options;
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
    this._nextPaginationToken = nextPaginationToken;
    this._prevPaginationToken = prevPaginationToken;
  }

  get homeserverUrl() {
    return this._homeserverUrl;
  }

  get roomDirectoryUrl() {
    return this._matrixPublicArchiveURLCreator.roomDirectoryUrl();
  }

  get nextPageUrl() {
    if (this._nextPaginationToken) {
      return this._matrixPublicArchiveURLCreator.roomDirectoryUrl({
        paginationToken: this._nextPaginationToken,
      });
    }

    return null;
  }

  get prevPageUrl() {
    if (this._prevPaginationToken) {
      return this._matrixPublicArchiveURLCreator.roomDirectoryUrl({
        paginationToken: this._prevPaginationToken,
      });
    }

    return null;
  }

  get rooms() {
    return this._rooms;
  }
}

module.exports = RoomDirectoryViewModel;
