'use strict';

const { ViewModel, ObservableMap, ApplyMap } = require('hydrogen-view-sdk');

const assert = require('matrix-public-archive-shared/lib/assert');

const LOCAL_STORAGE_KEYS = require('matrix-public-archive-shared/lib/local-storage-keys');
const ModalViewModel = require('matrix-public-archive-shared/viewmodels/ModalViewModel');
const HomeserverSelectionModalContentViewModel = require('matrix-public-archive-shared/viewmodels/HomeserverSelectionModalContentViewModel');
const RoomCardViewModel = require('matrix-public-archive-shared/viewmodels/RoomCardViewModel');
const checkTextForNsfw = require('matrix-public-archive-shared/lib/check-text-for-nsfw');
const { DIRECTION } = require('../lib/reference-values');

const DEFAULT_SERVER_LIST = ['matrix.org', 'gitter.im'];

class RoomDirectoryViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const {
      basePath,
      homeserverUrl,
      homeserverName,
      matrixPublicArchiveURLCreator,
      rooms,
      roomFetchError,
      pageSearchParameters,
      nextPaginationToken,
      prevPaginationToken,
    } = options;
    assert(basePath);
    assert(homeserverUrl);
    assert(homeserverName);
    assert(matrixPublicArchiveURLCreator);
    assert(rooms);

    this._roomFetchError = roomFetchError;

    this._homeserverUrl = homeserverUrl;
    this._homeserverName = homeserverName;
    this._matrixPublicArchiveURLCreator = matrixPublicArchiveURLCreator;

    this._isPageRedirectingFromUrlHash = false;

    this._pageSearchParameters = pageSearchParameters;
    // Default to what the page started with
    this._searchTerm = pageSearchParameters.searchTerm;
    this._nextPaginationToken = nextPaginationToken;
    this._prevPaginationToken = prevPaginationToken;

    // The default selected homeserver should be the one according to the page or the first one in the list
    this._homeserverSelection = pageSearchParameters.homeserver || this._availableHomeserverList[0];
    // The homeservers that the user added themselves (pulled from LocalStorage)
    this._addedHomeserversList = [];
    this.loadAddedHomeserversListFromPersistence();
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

    // This is based off of
    // https://github.com/vector-im/hydrogen-web/blob/e77727ea5992a3ec2649edd53a42e6d75f50a0ca/src/domain/session/leftpanel/LeftPanelViewModel.js#L30-L32
    this._roomCardViewModelsMap = new ObservableMap();
    rooms.forEach((room) => {
      this._roomCardViewModelsMap.set(
        room.room_id,
        new RoomCardViewModel({
          room,
          basePath,
          homeserverUrlToPullMediaFrom: homeserverUrl,
          viaServers: [
            // If the room is being shown in the directory from this server, then surely
            // we can join via this server
            this._pageSearchParameters.homeserver,
          ],
        })
      );
    });
    this._roomCardViewModelsFilterMap = new ApplyMap(this._roomCardViewModelsMap);
    this._roomCardViewModels = this._roomCardViewModelsFilterMap.sortValues((a, b) => {
      // Sort by the number of joined members descending (highest to lowest)
      if (b.numJoinedMembers > a.numJoinedMembers) {
        return 1;
      } else if (b.numJoinedMembers < a.numJoinedMembers) {
        return -1;
      }

      return 0;
    });

    this._safeSearchEnabled = true;
    this.loadSafeSearchEnabledFromPersistence();

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

  setPageRedirectingFromUrlHash(newValue) {
    this._isPageRedirectingFromUrlHash = newValue;
    this.emitChange('isPageRedirectingFromUrlHash');
  }

  get isPageRedirectingFromUrlHash() {
    return this._isPageRedirectingFromUrlHash;
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

  loadAddedHomeserversListFromPersistence() {
    if (window.localStorage) {
      let addedHomeserversFromPersistence = [];
      try {
        addedHomeserversFromPersistence = JSON.parse(
          window.localStorage.getItem(LOCAL_STORAGE_KEYS.addedHomeservers)
        );
      } catch (err) {
        console.warn(
          `Resetting \`${LOCAL_STORAGE_KEYS.addedHomeservers}\` stored in LocalStorage since we ran into an error parsing what was stored`,
          err
        );
        this.setAddedHomeserversList([]);
        return;
      }

      if (!Array.isArray(addedHomeserversFromPersistence)) {
        console.warn(
          `Resetting \`${LOCAL_STORAGE_KEYS.addedHomeservers}\` stored in LocalStorage since it wasn't an array as expected, addedHomeservers=${addedHomeserversFromPersistence}`
        );
        this.setAddedHomeserversList([]);
        return;
      }

      this.setAddedHomeserversList(addedHomeserversFromPersistence);
      return;
    } else {
      console.warn(
        `Skipping \`${LOCAL_STORAGE_KEYS.addedHomeservers}\` read from LocalStorage since LocalStorage is not available`
      );
    }
  }

  setAddedHomeserversList(addedHomeserversList) {
    this._addedHomeserversList = addedHomeserversList;
    window.localStorage.setItem(
      LOCAL_STORAGE_KEYS.addedHomeservers,
      JSON.stringify(this._addedHomeserversList)
    );

    // If the added homeserver list changes, make sure the default page-selected
    // homeserver is still somewhere in the list. If it's no longer in the added
    // homeserver list, we will put it in the default available list.
    this._calculateAvailableHomeserverList();

    this.emitChange('addedHomeserversList');
  }

  get addedHomeserversList() {
    return this._addedHomeserversList;
  }

  loadSafeSearchEnabledFromPersistence() {
    // Safe search is enabled by default and only disabled with the correct 'false' value
    let safeSearchEnabled = true;

    if (window.localStorage) {
      const safeSearchEnabledFromPersistence = window.localStorage.getItem(
        LOCAL_STORAGE_KEYS.safeSearchEnabled
      );

      if (safeSearchEnabledFromPersistence === 'false') {
        safeSearchEnabled = false;
      }
    } else {
      console.warn(
        `Skipping \`${LOCAL_STORAGE_KEYS.safeSearchEnabled}\` read from LocalStorage since LocalStorage is not available`
      );
    }

    this.setSafeSearchEnabled(safeSearchEnabled);
  }

  setSafeSearchEnabled(safeSearchEnabled) {
    this._safeSearchEnabled = safeSearchEnabled;
    if (window.localStorage) {
      window.localStorage.setItem(
        LOCAL_STORAGE_KEYS.safeSearchEnabled,
        safeSearchEnabled ? 'true' : 'false'
      );
    } else {
      console.warn(
        `Skipping \`${LOCAL_STORAGE_KEYS.safeSearchEnabled}\` write to LocalStorage since LocalStorage is not available`
      );
    }

    if (safeSearchEnabled) {
      this._roomCardViewModelsFilterMap.setApply((roomId, vm) => {
        // We concat the name, topic, etc together to simply do a single check against
        // all of the text.
        const isNsfw = checkTextForNsfw(vm.name + ' --- ' + vm.canonicalAlias + ' --- ' + vm.topic);
        vm.setBlockedBySafeSearch(isNsfw);
      });
    } else {
      this._roomCardViewModelsFilterMap.setApply(null);
      this._roomCardViewModelsFilterMap.applyOnce((roomId, vm) => {
        vm.setBlockedBySafeSearch(false);
      });
    }

    this.emitChange('safeSearchEnabled');
  }

  get safeSearchEnabled() {
    return this._safeSearchEnabled;
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
        direction: DIRECTION.forward,
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
        direction: DIRECTION.backward,
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
    this.emitChange('availableHomeserverList');
  }

  get availableHomeserverList() {
    return this._availableHomeserverList;
  }

  get roomCardViewModels() {
    return this._roomCardViewModels;
  }
}

module.exports = RoomDirectoryViewModel;
