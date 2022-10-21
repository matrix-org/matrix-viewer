'use strict';

const { ViewModel, ObservableArray } = require('hydrogen-view-sdk');

const assert = require('matrix-public-archive-shared/lib/assert');

const ModalViewModel = require('matrix-public-archive-shared/viewmodels/ModalViewModel');
const HomeserverSelectionModalContentViewModel = require('matrix-public-archive-shared/viewmodels/HomeserverSelectionModalContentViewModel');

const DEFAULT_SERVER_LIST = ['matrix.org', 'gitter.im', 'libera.chat'];

const ADDED_HOMESERVERS_LIST_LOCAL_STORAGE_KEY = 'addedHomservers';

class RoomDirectoryViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const {
      homeserverUrl,
      homeserverName,
      matrixPublicArchiveURLCreator,
      rooms,
      roomFetchError,
      searchParameters,
      nextPaginationToken,
      prevPaginationToken,
    } = options;
    assert(homeserverUrl);
    assert(homeserverName);
    assert(matrixPublicArchiveURLCreator);
    assert(rooms);

    this._roomFetchError = roomFetchError;

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

    this._searchParameters = searchParameters;
    this._searchTerm = searchParameters.searchTerm;
    this._addedHomeserversList = [];
    this._nextPaginationToken = nextPaginationToken;
    this._prevPaginationToken = prevPaginationToken;

    this._homeserverSelection = this.availableHomeserverList[0];

    this._homeserverSelectionModalContentViewModel = new HomeserverSelectionModalContentViewModel({
      onNewHomeserverAdded: this.onNewHomeserverAdded.bind(this),
    });

    this.homeserverSelectionModalViewModel = new ModalViewModel(
      this.childOptions({
        title: 'Add a new server',
        contentViewModel: this._homeserverSelectionModalContentViewModel,
        closeCallback: () => {
          const path = this.navigation.pathFrom([]);
          this.navigation.applyPath(path);
        },
      })
    );

    this.#setupNavigation();
  }

  #setupNavigation() {
    // Make sure the add-server modal open when the URL changes
    const handleAddServerNavigationChange = () => {
      const shouldShowAddServerModal = !!this.navigation.path.get('add-server')?.value;
      this.setShouldShowAddServerModal(shouldShowAddServerModal);
    };
    const addServer = this.navigation.observe('add-server');
    this.track(addServer.subscribe(handleAddServerNavigationChange));
    // Also handle the case where the URL already includes `#/add-server`
    // stuff from page-load
    const initialAddServer = addServer.get();
    handleAddServerNavigationChange(initialAddServer);
  }

  setShouldShowAddServerModal(shouldShowAddServerModal) {
    this.homeserverSelectionModalViewModel.setOpen(shouldShowAddServerModal);
  }

  get homeserverUrl() {
    return this._homeserverUrl;
  }

  get homeserverName() {
    return this._homeserverName;
  }

  get roomDirectoryUrl() {
    return this._matrixPublicArchiveURLCreator.roomDirectoryUrl();
  }

  get searchParameters() {
    return this._searchParameters;
  }

  get searchTerm() {
    return this._searchTerm || '';
  }

  setSearchTerm(newSearchTerm) {
    this._searchTerm = newSearchTerm;
    this.emitChange('searchTerm');
  }

  setHomeserverSelection(newHomeserver) {
    this._homeserverSelection = newHomeserver;
    this.emitChange('homeserverSelection');
  }

  onHomeserverSelectionAction(action) {
    if (action === 'action:add-new-server') {
      const path = this.navigation.pathFrom([this.navigation.segment('add-server')]);
      this.navigation.applyPath(path);
    } else if (action === 'action:clear-servers') {
      this.setAddedHomeserversList([]);
      // After clearing the added servers, just fallback to the first one in the available list.
      // We don't want people to be stuck on the "Clear servers" option.
      this._homeserverSelection = this.availableHomeserverList[0];
      this.emitChange('homeserverSelection');
    } else {
      console.warn(`Unknown action=${action} passed to \`onHomeserverSelectionAction\``);
    }
  }

  get homeserverSelection() {
    return this._homeserverSelection;
  }

  loadAddedHomserversListFromPersistence() {
    if (window.localStorage) {
      let addedHomeserversFromPersistence = [];
      try {
        addedHomeserversFromPersistence = JSON.parse(
          window.localStorage.getItem(ADDED_HOMESERVERS_LIST_LOCAL_STORAGE_KEY)
        );
      } catch (err) {
        console.warn(
          `Resetting \`${ADDED_HOMESERVERS_LIST_LOCAL_STORAGE_KEY}\` stored in LocalStorage since we ran into an error parsing what was stored`,
          err
        );
        this.setAddedHomeserversList([]);
        return;
      }

      if (!Array.isArray(addedHomeserversFromPersistence)) {
        console.warn(
          `Resetting \`${ADDED_HOMESERVERS_LIST_LOCAL_STORAGE_KEY}\` stored in LocalStorage since it wasn't an array as expected, addedHomeservers=${addedHomeserversFromPersistence}`
        );
        this.setAddedHomeserversList([]);
        return;
      }

      this.setAddedHomeserversList(addedHomeserversFromPersistence);
      return;
    } else {
      console.warn(
        `Skipping \`${ADDED_HOMESERVERS_LIST_LOCAL_STORAGE_KEY}\` read from LocalStorage since LocalStorage is not available`
      );
    }
  }

  setAddedHomeserversList(addedHomeserversList) {
    this._addedHomeserversList = addedHomeserversList;
    window.localStorage.setItem(
      ADDED_HOMESERVERS_LIST_LOCAL_STORAGE_KEY,
      JSON.stringify(this._addedHomeserversList)
    );
    this.emitChange('addedHomeserversList');
  }

  get addedHomeserversList() {
    return this._addedHomeserversList;
  }

  onNewHomeserverAdded(newHomeserver) {
    const addedHomeserversList = this.addedHomeserversList;
    this.setAddedHomeserversList(addedHomeserversList.concat(newHomeserver));
    this.setHomeserverSelection(newHomeserver);
  }

  get roomFetchError() {
    return this._roomFetchError;
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
