'use strict';

const { ViewModel } = require('hydrogen-view-sdk');
const assert = require('matrix-public-archive-shared/lib/assert');
const { TIME_PRECISION_VALUES } = require('matrix-public-archive-shared/lib/reference-values');

class TimeSelectorViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const {
      activeDate,
      preferredPrecision = TIME_PRECISION_VALUES.minutes,
      currentTimelineRangeStartTimestamp,
      currentTimelineRangeEndTimestamp,
    } = options;
    assert(
      Object.values(TIME_PRECISION_VALUES).includes(preferredPrecision),
      `TimeSelectorViewModel: options.preferredPrecision must be one of ${JSON.stringify(
        Object.values(TIME_PRECISION_VALUES)
      )}`
    );

    // The time (within the given date) being displayed in the time scrubber.
    // And we will choose a time within this day.
    this._activeDate = activeDate;
    this._preferredPrecision = preferredPrecision;

    this._currentTimelineRangeStartTimestamp = currentTimelineRangeStartTimestamp;
    this._currentTimelineRangeEndTimestamp = currentTimelineRangeEndTimestamp;

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

  get currentTimelineRangeStartTimestamp() {
    return this._currentTimelineRangeStartTimestamp;
  }

  get currentTimelineRangeEndTimestamp() {
    return this._currentTimelineRangeEndTimestamp;
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
