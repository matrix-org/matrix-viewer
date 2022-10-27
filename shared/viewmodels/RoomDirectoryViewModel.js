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
      pageSearchParameters,
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

    this._pageSearchParameters = pageSearchParameters;
    // Default to what the page started with
    this._searchTerm = pageSearchParameters.searchTerm;
    this._nextPaginationToken = nextPaginationToken;
    this._prevPaginationToken = prevPaginationToken;

    // The default selected homeserver should be the one according to the page or the first one in the list
    this._homeserverSelection = pageSearchParameters.homeserver || this._availableHomeserverList[0];
    // The homeservers that the user added themselves (pulled from LocalStorage)
    this._addedHomeserversList = [];
    this.loadAddedHomserversListFromPersistence();
    // The default list of homeservers to select from
    this._calculateAvailableHomeserverList();

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
          archiveRoomUrl: matrixPublicArchiveURLCreator.archiveUrlForRoom(
            room.canonical_alias || room.room_id,
            {
              // Only include via servers when we have to fallback to the room ID
              viaServers: room.canonical_alias ? undefined : [this.pageSearchParameters.homeserver],
            }
          ),
        };
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

  get pageSearchParameters() {
    return this._pageSearchParameters;
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

    // If the added homeserver list changes, make sure the default page selected
    // homeserver is still somewhere in the list. If it's no longer in the added
    // homeserver list, we will put it in the default available list.
    this._calculateAvailableHomeserverList();

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
        homeserver: this.homeserverSelection,
        searchTerm: this.searchTerm,
        paginationToken: this._nextPaginationToken,
      });
    }

    return null;
  }

  get prevPageUrl() {
    if (this._prevPaginationToken) {
      return this._matrixPublicArchiveURLCreator.roomDirectoryUrl({
        homeserver: this.homeserverSelection,
        searchTerm: this.searchTerm,
        paginationToken: this._prevPaginationToken,
      });
    }

    return null;
  }

  // The default list of available homeservers to select from. Deduplicates the the
  // homeserver we're pulling from and the `DEFAULT_SERVER_LIST`. Also makes sure that
  // the page selected homeserver is either in our default available list or in the
  // added servers list.
  _calculateAvailableHomeserverList() {
    // Append the default homeserver to the front
    const rawList = [this._homeserverName, ...DEFAULT_SERVER_LIST];

    // Make sure the page selected homeserver is in the list somewhere
    if (
      this.homeserverSelection &&
      !rawList.includes(this.homeserverSelection) &&
      !this._addedHomeserversList.includes(this.homeserverSelection)
    ) {
      rawList.unshift(this.homeserverSelection);
    }

    // Then deduplicate the list
    const deduplicatedHomeserverMap = {};
    rawList.forEach((homeserverName) => {
      deduplicatedHomeserverMap[homeserverName] = true;
    });
    const deduplicatedHomeserverList = Object.keys(deduplicatedHomeserverMap);

    this._availableHomeserverList = deduplicatedHomeserverList;
    this.emit('availableHomeserverList');
  }

  get availableHomeserverList() {
    return this._availableHomeserverList;
  }

  get rooms() {
    return this._rooms;
  }
}

module.exports = RoomDirectoryViewModel;
