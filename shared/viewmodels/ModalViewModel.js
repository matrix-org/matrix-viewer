'use strict';

const { ViewModel } = require('hydrogen-view-sdk');

class DeveloperOptionsViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { title, contentViewModel, open = false } = options;

    this._open = open;
    this._title = title;
    this._contentViewModel = contentViewModel;
  }

  get open() {
    return this._open;
  }

  setOpen(newOpen) {
    this._open = newOpen;
    this.emitChange('open');
  }

  get title() {
    return this._title;
  }

  get contentViewModel() {
    return this._contentViewModel;
  }
}

module.exports = DeveloperOptionsViewModel;
