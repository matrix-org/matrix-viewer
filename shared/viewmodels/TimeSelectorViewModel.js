'use strict';

const { ViewModel } = require('hydrogen-view-sdk');

class TimeSelectorViewModel extends ViewModel {
  constructor(options) {
    super(options);
    //const {} = options;

    this._isDragging = false;
    this._dragPositionX = null;
    this._velocityX = 0;
    this._momentumRafId = null;
  }

  get isDragging() {
    return this._isDragging;
  }

  setIsDragging(isDragging) {
    this._isDragging = isDragging;
    this.emitChange('isDragging');
  }

  get dragPositionX() {
    return this._dragPositionX;
  }

  setDragPositionX(dragPositionX) {
    this._dragPositionX = dragPositionX;
    // We don't `emitChange(...)` here because we don't need the UI to react to this
  }

  get velocityX() {
    return this._velocityX;
  }

  setVelocityX(velocityX) {
    this._velocityX = velocityX;
    // We don't `emitChange(...)` here because we don't need the UI to react to this
  }

  get momentumRafId() {
    return this._momentumRafId;
  }

  setMomentumRafId(momentumRafId) {
    this._momentumRafId = momentumRafId;
    // We don't `emitChange(...)` here because we don't need the UI to react to this
  }
}

module.exports = TimeSelectorViewModel;
