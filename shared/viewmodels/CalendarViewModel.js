import { ViewModel } from 'hydrogen-view-sdk';

import assert from 'matrix-public-archive-shared/lib/assert.js';

class CalendarViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { activeDate, calendarDate, room, matrixPublicArchiveURLCreator } = options;
    assert(activeDate);
    assert(calendarDate);
    assert(room);
    assert(matrixPublicArchiveURLCreator);

    // The day being shown in the archive
    this._activeDate = activeDate;
    // The month displayed in the calendar
    this._calendarDate = calendarDate;
    this._room = room;
    this._matrixPublicArchiveURLCreator = matrixPublicArchiveURLCreator;
  }

  get activeDate() {
    return this._activeDate;
  }

  get calendarDate() {
    return this._calendarDate;
  }

  setActiveDate(newActiveDateInput) {
    const newActiveDate = new Date(newActiveDateInput);
    this._activeDate = newActiveDate;
    this._calendarDate = newActiveDate;
    this.emitChange('activeDate');
    this.emitChange('calendarDate');
  }

  archiveUrlForDate(date) {
    return this._matrixPublicArchiveURLCreator.archiveUrlForDate(
      this._room.canonicalAlias || this._room.id,
      date
    );
  }

  prevMonth() {
    const prevMonthDate = new Date(this._calendarDate);
    prevMonthDate.setUTCMonth(this._calendarDate.getUTCMonth() - 1);
    this._calendarDate = prevMonthDate;
    this.emitChange('calendarDate');
  }

  nextMonth() {
    const nextMonthDate = new Date(this._calendarDate);
    nextMonthDate.setUTCMonth(this._calendarDate.getUTCMonth() + 1);
    console.log('nextMonthDate', nextMonthDate);
    this._calendarDate = nextMonthDate;
    this.emitChange('calendarDate');
  }

  onMonthInputChange(e) {
    this._calendarDate = e.target.valueAsDate;
    this.emitChange('calendarDate');
  }

  onYearFallbackSelectChange(e) {
    const selectedDate = new Date(this._calendarDate);
    selectedDate.setUTCFullYear(e.target.value);
    this._calendarDate = selectedDate;
    this.emitChange('calendarDate');
  }
}

export default CalendarViewModel;
