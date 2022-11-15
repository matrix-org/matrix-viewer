'use strict';

const { ViewModel } = require('hydrogen-view-sdk');
const assert = require('../lib/assert');

class TimeSelectorViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { activeDate, preferredPrecision = 'minutes' } = options;
    const validTimePrecisionValues = ['minutes', 'seconds'];
    assert(
      validTimePrecisionValues.includes(preferredPrecision),
      `TimeSelectorViewModel: options.preferredPrecision must be one of ${JSON.stringify(
        validTimePrecisionValues
      )}`
    );

    // The time (within the given date) being displayed in the time scrubber.
    // And we will choose a time within this day.
    this._activeDate = activeDate;
    this._preferredPrecision = preferredPrecision;

    this._isDragging = false;
  }

  get activeDate() {
    return this._activeDate;
  }

  setActiveDate(newActiveDateInput) {
    const newActiveDate = new Date(newActiveDateInput);
    this._activeDate = newActiveDate;
    this.emitChange('activeDate');
  }

  get preferredPrecision() {
    return this._preferredPrecision;
  }

  setPreferredPrecision(preferredPrecision) {
    this._preferredPrecision = preferredPrecision;
    this.emitChange('preferredPrecision');
  }

  get isDragging() {
    return this._isDragging;
  }

  setIsDragging(isDragging) {
    this._isDragging = isDragging;
    this.emitChange('isDragging');
  }
}

module.exports = TimeSelectorViewModel;
