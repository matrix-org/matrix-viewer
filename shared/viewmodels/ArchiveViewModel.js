'use strict';

const { ViewModel, setupLightboxNavigation } = require('hydrogen-view-sdk');

const assert = require('matrix-public-archive-shared/lib/assert');

const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');
const CalendarViewModel = require('matrix-public-archive-shared/viewmodels/CalendarViewModel');
const RightPanelContentView = require('matrix-public-archive-shared/views/RightPanelContentView');

class ArchiveViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { roomViewModel, room, fromDate, eventEntriesByEventId, basePath } = options;
    assert(roomViewModel);
    assert(room);
    assert(fromDate);
    assert(eventEntriesByEventId);

    this._room = room;
    this._eventEntriesByEventId = eventEntriesByEventId;
    this._currentTopPositionEventEntry = null;
    this._matrixPublicArchiveURLCreator = new MatrixPublicArchiveURLCreator(basePath);

    this._calendarViewModel = new CalendarViewModel({
      // The day being shown in the archive
      activeDate: fromDate,
      // The month displayed in the calendar
      calendarDate: fromDate,
      room,
      basePath,
    });

    this.roomViewModel = roomViewModel;
    // FIXME: Do we have to fake this?
    this.rightPanelModel = {
      navigation: this.navigation,
      activeViewModel: {
        type: 'custom',
        customView: RightPanelContentView,
        calendarViewModel: this._calendarViewModel,
      },
      closePanel() {
        const path = this.navigation.path.until('room');
        this.navigation.applyPath(path);
      },
    };

    this.#setupNavigation();
    this._updateRightPanel();
  }

  #setupNavigation() {
    const rightpanel = this.navigation.observe('right-panel');
    this.track(rightpanel.subscribe(() => this._updateRightPanel()));

    setupLightboxNavigation(this, 'lightboxViewModel', (eventId) => {
      return {
        room: this._room,
        eventEntry: this._eventEntriesByEventId[eventId],
      };
    });
  }

  get eventEntriesByEventId() {
    return this._eventEntriesByEventId;
  }

  get currentTopPositionEventEntry() {
    return this._currentTopPositionEventEntry;
  }

  get shouldShowRightPanel() {
    return this._shouldShowRightPanel;
  }

  setCurrentTopPositionEventEntry(currentTopPositionEventEntry) {
    this._currentTopPositionEventEntry = currentTopPositionEventEntry;
    this.emitChange('currentTopPositionEventEntry');

    // Update the calendar
    this._calendarViewModel.setActiveDate(currentTopPositionEventEntry.timestamp);

    // Update the URL
    this.history.replaceUrlSilently(
      this._matrixPublicArchiveURLCreator.archiveUrlForDate(
        this._room.id,
        new Date(currentTopPositionEventEntry.timestamp)
      )
    );
  }

  _updateRightPanel() {
    this._shouldShowRightPanel = !!this.navigation.path.get('right-panel')?.value;
    this.emitChange('shouldShowRightPanel');
  }
}

module.exports = ArchiveViewModel;
