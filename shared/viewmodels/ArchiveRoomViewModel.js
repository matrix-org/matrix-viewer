'use strict';

const { ViewModel, setupLightboxNavigation } = require('hydrogen-view-sdk');

const assert = require('matrix-public-archive-shared/lib/assert');

const ModalViewModel = require('matrix-public-archive-shared/viewmodels/ModalViewModel');
const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');
const CalendarViewModel = require('matrix-public-archive-shared/viewmodels/CalendarViewModel');
const DeveloperOptionsContentViewModel = require('matrix-public-archive-shared/viewmodels/DeveloperOptionsContentViewModel');
const RightPanelContentView = require('matrix-public-archive-shared/views/RightPanelContentView');

class ArchiveRoomViewModel extends ViewModel {
  constructor(options) {
    super(options);
    const { roomViewModel, room, fromDate, eventEntriesByEventId, shouldIndex, basePath } = options;
    assert(roomViewModel);
    assert(room);
    assert(fromDate);
    assert(shouldIndex !== undefined);
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

    this._developerOptionsContentViewModel = new DeveloperOptionsContentViewModel(
      this.childOptions({
        /* any explicit options */
      })
    );
    this._developerOptionsContentViewModel.loadValuesFromPersistence();

    this._developerOptionsModalViewModel = new ModalViewModel({
      title: 'Developer options',
      contentViewModel: this._developerOptionsContentViewModel,
      closeUrl: this.urlCreator.urlUntilSegment('room'),
    });

    const navigation = this.navigation;
    const urlCreator = this.urlCreator;

    this.roomViewModel = roomViewModel;
    // FIXME: Do we have to fake this?
    this.rightPanelModel = {
      navigation,
      activeViewModel: {
        // Our own custom options
        type: 'custom',
        customView: RightPanelContentView,
        calendarViewModel: this._calendarViewModel,
        shouldIndex,
        get developerOptionsUrl() {
          return urlCreator.urlForSegments([
            navigation.segment('room', room.id),
            navigation.segment('developer-options'),
          ]);
        },
      },
      closePanel() {
        const path = this.navigation.path.until('room');
        this.navigation.applyPath(path);
      },
    };

    this.#setupNavigation();
  }

  #setupNavigation() {
    // Make sure the right panel opens when the URL changes (only really matters
    // on mobile)
    const handleRightPanelNavigationChange = (rightpanelHashExists) => {
      this._shouldShowRightPanel = rightpanelHashExists;
      this.emitChange('shouldShowRightPanel');
    };
    const rightpanel = this.navigation.observe('right-panel');
    this.track(rightpanel.subscribe(handleRightPanelNavigationChange));
    // Also handle the case where the URL already includes right-panel stuff
    // from page-load
    const initialRightPanel = rightpanel.get();
    handleRightPanelNavigationChange(initialRightPanel);

    // Make sure the developer options open when the URL changes
    const handleDeveloperOptionsNavigationChange = () => {
      const shouldShowDeveloperOptions = !!this.navigation.path.get('developer-options')?.value;
      this.setShouldShowDeveloperOptions(shouldShowDeveloperOptions);
    };
    const developerOptions = this.navigation.observe('developer-options');
    this.track(developerOptions.subscribe(handleDeveloperOptionsNavigationChange));
    // Also handle the case where the URL already includes `#/developer-options`
    // stuff from page-load
    const initialDeveloperOptions = developerOptions.get();
    handleDeveloperOptionsNavigationChange(initialDeveloperOptions);

    // Make sure the lightbox opens when the URL changes
    setupLightboxNavigation(this, 'lightboxViewModel', (eventId) => {
      return {
        room: this._room,
        eventEntry: this._eventEntriesByEventId[eventId],
      };
    });

    // Also make sure when someone opens the lightbox, the day in the URL
    // changes to when the timestamp of the associated event so the link opens
    // with the event in the timeline and the lightbox opens again. We don't
    // want to have a date mismatch because your scroll is on another day while
    // viewing the lightbox.
    const handleLightBoxNavigationChange = (eventId) => {
      if (eventId) {
        const eventEntry = this._eventEntriesByEventId[eventId];
        if (eventEntry) {
          this.setCurrentTopPositionEventEntry(eventEntry);
        }
      }
    };
    const lightbox = this.navigation.observe('lightbox');
    this.track(lightbox.subscribe(handleLightBoxNavigationChange));
    // Also handle the case where the URL already includes `/lightbox/$eventId` (like
    // from page-load)
    const initialLightBoxEventId = lightbox.get();
    handleLightBoxNavigationChange(initialLightBoxEventId);
  }

  setShouldShowDeveloperOptions(shouldShowDeveloperOptions) {
    this._developerOptionsModalViewModel.setOpen(shouldShowDeveloperOptions);
  }

  get developerOptionsContentViewModel() {
    return this._developerOptionsContentViewModel;
  }

  get developerOptionsModalViewModel() {
    return this._developerOptionsModalViewModel;
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
      ) + window.location.hash
    );
  }
}

module.exports = ArchiveRoomViewModel;
