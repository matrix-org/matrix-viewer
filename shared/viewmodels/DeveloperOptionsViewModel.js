'use strict';

const { ViewModel } = require('hydrogen-view-sdk');

const assert = require('matrix-public-archive-shared/lib/assert');

class DeveloperOptionsViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { debugActiveDateIntersectionObserver = false } = options;
    //assert(todo);

    this._debugActiveDateIntersectionObserver = debugActiveDateIntersectionObserver;
  }

  loadValuesFromPersistence() {
    if (window.localStorage) {
      this._debugActiveDateIntersectionObserver = window.localStorage.getItem(
        'debugActiveDateIntersectionObserver'
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

  get closeUrl() {
    return this.urlCreator.urlUntilSegment('room');
  }
}

module.exports = DeveloperOptionsViewModel;
