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
    if (window.localStorage) {
      this._debugActiveDateIntersectionObserver = JSON.parse(
        window.localStorage.getItem(LOCAL_STORAGE_KEYS.debugActiveDateIntersectionObserver)
      );
      this.emitChange('debugActiveDateIntersectionObserver');
    } else {
      console.warn(
        `Skipping \`${LOCAL_STORAGE_KEYS.debugActiveDateIntersectionObserver}\` read from LocalStorage since LocalStorage is not available`
      );
    }
  }

  get debugActiveDateIntersectionObserver() {
    return this._debugActiveDateIntersectionObserver;
  }

  toggleDebugActiveDateIntersectionObserver(checkedValue) {
    this._debugActiveDateIntersectionObserver = checkedValue;
    window.localStorage.setItem(
      LOCAL_STORAGE_KEYS.debugActiveDateIntersectionObserver,
      this._debugActiveDateIntersectionObserver
    );
    this.emitChange('debugActiveDateIntersectionObserver');
  }

  get roomId() {
    return this._room.id;
  }
}

module.exports = DeveloperOptionsContentViewModel;
