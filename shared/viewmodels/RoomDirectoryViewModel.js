'use strict';

const { ViewModel, ObservableArray } = require('hydrogen-view-sdk');

const assert = require('matrix-public-archive-shared/lib/assert');

const DEFAULT_SERVER_LIST = ['matrix.org', 'gitter.im', 'libera.chat'];

class RoomDirectoryViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const {
      homeserverUrl,
      homeserverName,
      matrixPublicArchiveURLCreator,
      rooms,
      searchTerm,
      nextPaginationToken,
      prevPaginationToken,
    } = options;
    assert(homeserverUrl);
    assert(homeserverName);
    assert(matrixPublicArchiveURLCreator);
    assert(rooms);

    this._homeserverUrl = homeserverUrl;
    this._homeserverName = homeserverName;
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
    this._searchTerm = searchTerm;
    this._nextPaginationToken = nextPaginationToken;
    this._prevPaginationToken = prevPaginationToken;
  }

  get homeserverUrl() {
    return this._homeserverUrl;
  }

  get roomDirectoryUrl() {
    return this._matrixPublicArchiveURLCreator.roomDirectoryUrl();
  }

  get searchTerm() {
    return this._searchTerm || '';
  }

  get nextPageUrl() {
    if (this._nextPaginationToken) {
      return this._matrixPublicArchiveURLCreator.roomDirectoryUrl({
        searchTerm: this.searchTerm,
        paginationToken: this._nextPaginationToken,
      });
    }

    return null;
  }

  get prevPageUrl() {
    if (this._prevPaginationToken) {
      return this._matrixPublicArchiveURLCreator.roomDirectoryUrl({
        searchTerm: this.searchTerm,
        paginationToken: this._prevPaginationToken,
      });
    }

    return null;
  }

  get availableHomeserverList() {
    // Append the default homeserver to the front
    const rawList = [this._homeserverName, ...DEFAULT_SERVER_LIST];

    // Then deduplicate the list
    const deduplicatedHomeserverMap = {};
    rawList.forEach((homeserverName) => {
      deduplicatedHomeserverMap[homeserverName] = true;
    });
    const deduplicatedHomeserverList = Object.keys(deduplicatedHomeserverMap);

    return deduplicatedHomeserverList;
  }

  get rooms() {
    return this._rooms;
  }
}

module.exports = RoomDirectoryViewModel;
