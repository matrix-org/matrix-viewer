const { ViewModel } = require('hydrogen-view-sdk');

class ModalViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { title, contentViewModel, closeCallback, open = false } = options;

    this._open = open;
    this._title = title;
    this._contentViewModel = contentViewModel;
    this._closeCallback = closeCallback;
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

  get closeCallback() {
    return this._closeCallback;
  }
}

module.exports = ModalViewModel;
