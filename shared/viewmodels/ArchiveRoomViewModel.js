'use strict';

const {
  ViewModel,
  setupLightboxNavigation,
  TilesCollection,
  Timeline,
  FragmentIdComparer,
  EventEntry,
  encodeKey,
  encodeEventIdKey,
} = require('hydrogen-view-sdk');

const assert = require('matrix-public-archive-shared/lib/assert');

const ModalViewModel = require('matrix-public-archive-shared/viewmodels/ModalViewModel');
const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');
const CalendarViewModel = require('matrix-public-archive-shared/viewmodels/CalendarViewModel');
const DeveloperOptionsContentViewModel = require('matrix-public-archive-shared/viewmodels/DeveloperOptionsContentViewModel');
const RightPanelContentView = require('matrix-public-archive-shared/views/RightPanelContentView');
const AvatarViewModel = require('matrix-public-archive-shared/viewmodels/AvatarViewModel');
const {
  customTileClassForEntry,
} = require('matrix-public-archive-shared/lib/custom-tile-utilities');
const stubPowerLevelsObservable = require('matrix-public-archive-shared/lib/stub-powerlevels-observable');

let txnCount = 0;
function getFakeEventId() {
  txnCount++;
  return `fake-event-id-${new Date().getTime()}--${txnCount}`;
}

let eventIndexCounter = 0;
const fragmentIdComparer = new FragmentIdComparer([]);
function makeEventEntryFromEventJson(eventJson, memberEvent) {
  assert(eventJson);

  const roomId = eventJson.roomId;
  const eventIndex = eventIndexCounter;
  const eventEntry = new EventEntry(
    {
      fragmentId: 0,
      eventIndex: eventIndex, // TODO: What should this be?
      roomId,
      event: eventJson,
      displayName: memberEvent && memberEvent.content && memberEvent.content.displayname,
      avatarUrl: memberEvent && memberEvent.content && memberEvent.content.avatar_url,
      key: encodeKey(roomId, 0, eventIndex),
      eventIdKey: encodeEventIdKey(roomId, eventJson.event_id),
    },
    fragmentIdComparer
  );

  eventIndexCounter++;

  return eventEntry;
}

class ArchiveRoomViewModel extends ViewModel {
  // eslint-disable-next-line max-statements
  constructor(options) {
    super(options);
    const {
      homeserverUrl,
      room,
      dayTimestampFrom,
      dayTimestampTo,
      scrollStartEventId,
      events,
      stateEventMap,
      shouldIndex,
      basePath,
    } = options;
    assert(homeserverUrl);
    assert(room);
    assert(dayTimestampFrom);
    assert(dayTimestampTo);
    assert(events);
    assert(stateEventMap);
    assert(shouldIndex !== undefined);
    assert(events);

    this._room = room;
    this._dayTimestampFrom = dayTimestampFrom;
    this._dayTimestampTo = dayTimestampTo;
    this._currentTopPositionEventEntry = null;
    this._matrixPublicArchiveURLCreator = new MatrixPublicArchiveURLCreator(basePath);
    this._basePath = basePath;

    const navigation = this.navigation;
    const urlRouter = this.urlRouter;

    // Setup events and tiles necessary to render
    const eventsToDisplay = this._addJumpSummaryEvents(events);
    const { eventEntriesByEventId, tiles } = this._createHydrogenTilesFromEvents({
      room: this._room,
      events: eventsToDisplay,
      stateEventMap,
    });
    this._eventEntriesByEventId = eventEntriesByEventId;

    this._roomAvatarViewModel = new AvatarViewModel({
      homeserverUrlToPullMediaFrom: homeserverUrl,
      avatarUrl: this._room.avatarUrl,
      avatarTitle: this._room.name || this._room.canonicalAlias || this._room.id,
      avatarLetterString:
        this._room.name ||
        // Skip to the first letter after the `#` sigil from the alias
        this._room.canonicalAlias?.[1] ||
        // Skip to the first letter after the `!` sigil from the room ID
        this._room.id?.[1],
      entityId: this._room.id,
    });

    const initialDate = new Date(dayTimestampFrom);
    this._calendarViewModel = new CalendarViewModel({
      // The day being shown in the archive
      activeDate: initialDate,
      // The month displayed in the calendar
      calendarDate: initialDate,
      room,
      basePath,
    });

    this._developerOptionsContentViewModel = new DeveloperOptionsContentViewModel(
      this.childOptions({
        /* any explicit options */
      })
    );
    this._developerOptionsContentViewModel.loadValuesFromPersistence();

    this._developerOptionsModalViewModel = new ModalViewModel(
      this.childOptions({
        title: 'Developer options',
        contentViewModel: this._developerOptionsContentViewModel,
        closeCallback: () => {
          const path = this.navigation.path.until('room');
          this.navigation.applyPath(path);
        },
      })
    );

    this._timelineViewModel = {
      showJumpDown: false,
      setVisibleTileRange() {},
      tiles,
      // This will cause the event ID to be scrolled into view
      get eventIdHighlighted() {
        return scrollStartEventId;
      },
    };
    // Set the event highlight
    if (scrollStartEventId) {
      eventEntriesByEventId[scrollStartEventId]?.setIsHighlighted(true);
    }

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
          return urlRouter.urlForSegments([
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

  get timelineViewModel() {
    return this._timelineViewModel;
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
  }

  get dayTimestampFrom() {
    return this._dayTimestampFrom;
  }

  get roomDirectoryUrl() {
    return this._matrixPublicArchiveURLCreator.roomDirectoryUrl();
  }

  get roomPermalink() {
    return this._matrixPublicArchiveURLCreator.permalinkForRoom(this._room.id);
  }

  get roomName() {
    return this._room.name;
  }

  get roomAvatarViewModel() {
    return this._roomAvatarViewModel;
  }

  openRightPanel() {
    let path = this.navigation.path.until('room');
    path = path.with(this.navigation.segment('right-panel', true));
    path = path.with(this.navigation.segment('change-dates', true));
    this.navigation.applyPath(path);
  }

  // Add the placeholder events which render the "Jump to previous/next activity" links
  // in the timeline
  _addJumpSummaryEvents(inputEventList) {
    const events = [...inputEventList];

    const hasEventsFromGivenDay =
      events[events.length - 1]?.origin_server_ts >= this._dayTimestampFrom;
    let daySummaryKind;
    if (events.length === 0) {
      daySummaryKind = 'no-events-at-all';
    } else if (hasEventsFromGivenDay) {
      daySummaryKind = 'some-events-in-day';
    } else if (!hasEventsFromGivenDay) {
      daySummaryKind = 'no-events-in-day';
    }

    // Add a summary item to the top of the timeline that allows you to jump to more
    // previous activity. Also explain that you might have hit the beginning of the room.
    //
    // As long as there are events shown, have a button to jump to more previous activity
    if (daySummaryKind !== 'no-events-at-all') {
      events.unshift({
        event_id: getFakeEventId(),
        type: 'org.matrix.archive.jump_to_previous_activity_summary',
        room_id: this._room.id,
        // Even though this isn't used for sort, just using the time where the event
        // would logically be (at the start of the day)
        origin_server_ts: events[0].origin_server_ts - 1,
        content: {
          canonicalAlias: this._room.canonicalAlias,
          // The start of the range to use as a jumping off point to the previous activity
          rangeStartTimestamp: events[0].origin_server_ts - 1,
          // This is a bit cheating but I don't know how else to pass this kind of
          // info to the Tile viewmodel
          basePath: this._basePath,
        },
      });
    }

    // Add a summary item to the bottom of the timeline that explains if we found events
    // on the day requested. Also allow the user to jump to the next activity in the room.
    events.push({
      event_id: getFakeEventId(),
      type: 'org.matrix.archive.jump_to_next_activity_summary',
      room_id: this._room.id,
      // Even though this isn't used for sort, just using the time where the event
      // would logically be.
      //
      // -1 so we're not at 00:00:00 of the next day
      origin_server_ts: this._dayTimestampTo - 1,
      content: {
        canonicalAlias: this._room.canonicalAlias,
        daySummaryKind,
        // The timestamp from the URL that was originally visited
        dayTimestamp: this._dayTimestampFrom,
        // The end of the range to use as a jumping off point to the next activity
        rangeEndTimestamp: this._dayTimestampTo,
        // This is a bit cheating but I don't know how else to pass this kind of
        // info to the Tile viewmodel
        basePath: this._basePath,
      },
    });

    return events;
  }

  // A bunch of Hydrogen boilerplate to convert the events JSON into some `tiles` we can
  // use with the `TimelineView`
  _createHydrogenTilesFromEvents({ room, events, stateEventMap }) {
    // We use the timeline to setup the relations between entries
    const timeline = new Timeline({
      roomId: room.id,
      fragmentIdComparer: fragmentIdComparer,
      clock: this.platform.clock,
      logger: this.platform.logger,
      powerLevelsObservable: stubPowerLevelsObservable,
    });

    // Something we can modify with new state updates as we see them
    const workingStateEventMap = {
      ...stateEventMap,
    };

    const eventEntries = events.map((event) => {
      if (event.type === 'm.room.member') {
        workingStateEventMap[event.state_key] = event;
      }

      const memberEvent = workingStateEventMap[event.user_id];
      return makeEventEntryFromEventJson(event, memberEvent);
    });
    //console.log('eventEntries', eventEntries.length);

    // Map of `event_id` to `EventEntry`
    const eventEntriesByEventId = eventEntries.reduce((currentMap, eventEntry) => {
      currentMap[eventEntry.id] = eventEntry;
      return currentMap;
    }, {});

    // We have to use `timeline._setupEntries([])` because it sets
    // `this._allEntries` in `Timeline` and we don't want to use `timeline.load()`
    // to request remote things.
    timeline._setupEntries([]);
    // Make it safe to iterate a derived observable collection
    timeline.entries.subscribe({ onAdd: () => null, onUpdate: () => null });
    // We use the timeline to setup the relations between entries
    timeline.addEntries(eventEntries);

    //console.log('timeline.entries', timeline.entries.length, timeline.entries);

    const tiles = new TilesCollection(timeline.entries, {
      tileClassForEntry: customTileClassForEntry,
      platform: this.platform,
      navigation: this.navigation,
      urlRouter: this.urlRouter,
      timeline,
      roomVM: {
        room,
      },
    });
    // Trigger `onSubscribeFirst` -> `tiles._populateTiles()` so it creates a tile
    // for each entry to display. This way we can also call `tile.notifyVisible()`
    // on each tile so that the tile creation doesn't happen later when the
    // `TilesListView` is mounted and subscribes which is a bit out of our
    // control.
    tiles.subscribe({ onAdd: () => null, onUpdate: () => null });

    // Make the lazy-load images appear
    for (const tile of tiles) {
      tile.notifyVisible();
    }

    return {
      tiles,
      eventEntriesByEventId,
    };
  }
}

module.exports = ArchiveRoomViewModel;
