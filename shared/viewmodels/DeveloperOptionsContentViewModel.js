'use strict';

const { ViewModel } = require('hydrogen-view-sdk');

class DeveloperOptionsViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { debugActiveDateIntersectionObserver = false } = options;

    this._debugActiveDateIntersectionObserver = debugActiveDateIntersectionObserver;
  }

  loadValuesFromPersistence() {
    if (window.localStorage) {
      this._debugActiveDateIntersectionObserver = JSON.parse(
        window.localStorage.getItem('debugActiveDateIntersectionObserver')
      );
      this.emitChange('debugActiveDateIntersectionObserver');
    } else {
      console.warn(`Skipping read from localStorage since it's not available`);
    }
  }

  get debugActiveDateIntersectionObserver() {
    return this._debugActiveDateIntersectionObserver;
  }

  toggleDebugActiveDateIntersectionObserver(checkedValue) {
    this._debugActiveDateIntersectionObserver = checkedValue;
    window.localStorage.setItem(
      'debugActiveDateIntersectionObserver',
      this._debugActiveDateIntersectionObserver
    );
    this.emitChange('debugActiveDateIntersectionObserver');
  }
}

module.exports = DeveloperOptionsViewModel;
