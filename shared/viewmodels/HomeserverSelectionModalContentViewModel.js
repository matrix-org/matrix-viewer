'use strict';

const { ViewModel } = require('hydrogen-view-sdk');

class HomeserverSelectionModalContentViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { onNewHomeserverAdded } = options;

    this._onNewHomeserverAdded = onNewHomeserverAdded;
  }

  onNewHomeserverAdded(newHomeserver) {
    this._onNewHomeserverAdded(newHomeserver);
  }
}

module.exports = HomeserverSelectionModalContentViewModel;
