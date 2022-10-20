'use strict';

const { ViewModel } = require('hydrogen-view-sdk');

const DEBUG_ACTIVE_DATE_INTERSECTION_OBSERVER_LOCAL_STORAGE_KEY =
  'debugActiveDateIntersectionObserver';

class DeveloperOptionsViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { debugActiveDateIntersectionObserver = false } = options;

    this._debugActiveDateIntersectionObserver = debugActiveDateIntersectionObserver;
  }

  loadValuesFromPersistence() {
    if (window.localStorage) {
      this._debugActiveDateIntersectionObserver = JSON.parse(
        window.localStorage.getItem(DEBUG_ACTIVE_DATE_INTERSECTION_OBSERVER_LOCAL_STORAGE_KEY)
      );
      this.emitChange('debugActiveDateIntersectionObserver');
    } else {
      console.warn(`Skipping read from LocalStorage since LocalStorage not available`);
    }
  }

  get debugActiveDateIntersectionObserver() {
    return this._debugActiveDateIntersectionObserver;
  }

  toggleDebugActiveDateIntersectionObserver(checkedValue) {
    this._debugActiveDateIntersectionObserver = checkedValue;
    window.localStorage.setItem(
      DEBUG_ACTIVE_DATE_INTERSECTION_OBSERVER_LOCAL_STORAGE_KEY,
      this._debugActiveDateIntersectionObserver
    );
    this.emitChange('debugActiveDateIntersectionObserver');
  }
}

module.exports = DeveloperOptionsViewModel;
