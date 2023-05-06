'use strict';

const { ViewModel } = require('hydrogen-view-sdk');

const LOCAL_STORAGE_KEYS = require('matrix-public-archive-shared/lib/local-storage-keys');

class DeveloperOptionsContentViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { room, debugActiveDateIntersectionObserver = false } = options;

    this._room = room;
    this._debugActiveDateIntersectionObserver = debugActiveDateIntersectionObserver;
  }

  loadValuesFromPersistence() {
    // Debugging is disabled by default and only enabled with the correct 'true' value
    let debugActiveDateIntersectionObserver = false;

    if (window.localStorage) {
      const debugActiveDateIntersectionObserverFromPersistence = window.localStorage.getItem(
        LOCAL_STORAGE_KEYS.debugActiveDateIntersectionObserver
      );

      if (debugActiveDateIntersectionObserverFromPersistence === 'true') {
        debugActiveDateIntersectionObserver = true;
      }
    } else {
      console.warn(
        `Skipping \`${LOCAL_STORAGE_KEYS.debugActiveDateIntersectionObserver}\` read from LocalStorage since LocalStorage is not available`
      );
    }

    this.toggleDebugActiveDateIntersectionObserver(debugActiveDateIntersectionObserver);
  }

  get debugActiveDateIntersectionObserver() {
    return this._debugActiveDateIntersectionObserver;
  }

  toggleDebugActiveDateIntersectionObserver(checkedValue) {
    this._debugActiveDateIntersectionObserver = checkedValue;
    if (window.localStorage) {
      window.localStorage.setItem(
        LOCAL_STORAGE_KEYS.debugActiveDateIntersectionObserver,
        this._debugActiveDateIntersectionObserver ? 'true' : 'false'
      );
    } else {
      console.warn(
        `Skipping \`${LOCAL_STORAGE_KEYS.debugActiveDateIntersectionObserver}\` write to LocalStorage since LocalStorage is not available`
      );
    }

    this.emitChange('debugActiveDateIntersectionObserver');
  }

  get roomId() {
    return this._room.id;
  }
}

module.exports = DeveloperOptionsContentViewModel;
