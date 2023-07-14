'use strict';

const { ViewModel } = require('hydrogen-view-sdk');
const assert = require('matrix-viewer-shared/lib/assert');
const { TIME_PRECISION_VALUES } = require('matrix-viewer-shared/lib/reference-values');

class TimeSelectorViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const {
      room,
      activeDate,
      preferredPrecision = TIME_PRECISION_VALUES.minutes,
      timelineRangeStartTimestamp,
      timelineRangeEndTimestamp,
      matrixViewerURLCreator,
    } = options;
    assert(room);
    assert(activeDate);
    assert(matrixViewerURLCreator);
    assert(
      Object.values(TIME_PRECISION_VALUES).includes(preferredPrecision),
      `TimeSelectorViewModel: options.preferredPrecision must be one of ${JSON.stringify(
        Object.values(TIME_PRECISION_VALUES)
      )}`
    );

    this._room = room;
    // The time (within the given date) being displayed in the time scrubber.
    // And we will choose a time within this day.
    this._activeDate = activeDate;
    this._preferredPrecision = preferredPrecision;

    this._timelineRangeStartTimestamp = timelineRangeStartTimestamp;
    this._timelineRangeEndTimestamp = timelineRangeEndTimestamp;
    this._matrixViewerURLCreator = matrixViewerURLCreator;

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

  get goToActiveDateUrl() {
    return this._matrixViewerURLCreator.roomUrlForDate(
      this._room.canonicalAlias || this._room.id,
      this.activeDate,
      { preferredPrecision: this.preferredPrecision }
    );
  }

  get preferredPrecision() {
    return this._preferredPrecision;
  }

  setPreferredPrecision(preferredPrecision) {
    this._preferredPrecision = preferredPrecision;
    this.emitChange('preferredPrecision');
  }

  get timelineRangeStartTimestamp() {
    return this._timelineRangeStartTimestamp;
  }

  get timelineRangeEndTimestamp() {
    return this._timelineRangeEndTimestamp;
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
