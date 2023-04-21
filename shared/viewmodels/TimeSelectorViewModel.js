import { ViewModel } from 'hydrogen-view-sdk';
import assert from 'matrix-public-archive-shared/lib/assert';
import { TIME_PRECISION_VALUES } from 'matrix-public-archive-shared/lib/reference-values';

class TimeSelectorViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const {
      room,
      activeDate,
      preferredPrecision = TIME_PRECISION_VALUES.minutes,
      timelineRangeStartTimestamp,
      timelineRangeEndTimestamp,
      matrixPublicArchiveURLCreator,
    } = options;
    assert(room);
    assert(activeDate);
    assert(matrixPublicArchiveURLCreator);
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
    this._matrixPublicArchiveURLCreator = matrixPublicArchiveURLCreator;

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
    return this._matrixPublicArchiveURLCreator.archiveUrlForDate(
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

export default TimeSelectorViewModel;
