'use strict';

const assert = require('matrix-public-archive-shared/lib/assert');
const {
  Platform,
  MediaRepository,
  createNavigation,
  createRouter,
  Segment,

  TilesCollection,
  FragmentIdComparer,
  tilesCreator: makeTilesCreator,
  EventEntry,
  encodeKey,
  encodeEventIdKey,
  Timeline,
  // TimelineView,
  // RoomView,
  RoomViewModel,
  ViewModel,
} = require('hydrogen-view-sdk');
const urlJoin = require('url-join');

const ArchiveView = require('matrix-public-archive-shared/ArchiveView');
const RightPanelContentView = require('matrix-public-archive-shared/RightPanelContentView');

const fromTimestamp = window.matrixPublicArchiveContext.fromTimestamp;
assert(fromTimestamp);
const roomData = window.matrixPublicArchiveContext.roomData;
assert(roomData);
const events = window.matrixPublicArchiveContext.events;
assert(events);
const stateEventMap = window.matrixPublicArchiveContext.stateEventMap;
assert(stateEventMap);
const config = window.matrixPublicArchiveContext.config;
assert(config);
assert(config.matrixServerUrl);
assert(config.basePath);

let eventIndexCounter = 0;
const fragmentIdComparer = new FragmentIdComparer([]);
function makeEventEntryFromEventJson(eventJson, memberEvent) {
  assert(eventJson);

  const eventIndex = eventIndexCounter;
  const eventEntry = new EventEntry(
    {
      fragmentId: 0,
      eventIndex: eventIndex, // TODO: What should this be?
      roomId: roomData.id,
      event: eventJson,
      displayName: memberEvent && memberEvent.content && memberEvent.content.displayname,
      avatarUrl: memberEvent && memberEvent.content && memberEvent.content.avatar_url,
      key: encodeKey(roomData.id, 0, eventIndex),
      eventIdKey: encodeEventIdKey(roomData.id, eventJson.event_id),
    },
    fragmentIdComparer
  );

  eventIndexCounter++;

  return eventEntry;
}

// eslint-disable-next-line max-statements
async function mountHydrogen() {
  const app = document.querySelector('#app');

  const platformConfig = {};
  const assetPaths = {};
  const platform = new Platform(app, assetPaths, platformConfig, { development: true });

  const navigation = createNavigation();
  platform.setNavigation(navigation);
  const urlRouter = createRouter({
    navigation: navigation,
    history: platform.history,
  });

  // We use the timeline to setup the relations between entries
  const timeline = new Timeline({
    roomId: roomData.id,
    //storage: this._storage,
    fragmentIdComparer: fragmentIdComparer,
    clock: platform.clock,
    logger: platform.logger,
    //hsApi: this._hsApi
  });

  const mediaRepository = new MediaRepository({
    homeserver: config.matrixServerUrl,
  });

  // const urlRouter = {
  //   urlUntilSegment: () => {
  //     return 'todo';
  //   },
  //   urlForSegments: (segments) => {
  //     const isLightBox = segments.find((segment) => {
  //       return segment.type === 'lightbox';
  //       console.log('segment', segment);
  //     });

  //     if (isLightBox) {
  //       return '#';
  //     }

  //     return 'todo';
  //   },
  // };

  // const navigation = {
  //   segment: (type, value) => {
  //     return new Segment(type, value);
  //   },
  // };

  const lightbox = navigation.observe('lightbox');
  lightbox.subscribe((eventId) => {
    this._updateLightbox(eventId);
  });

  const room = {
    name: roomData.name,
    id: roomData.id,
    avatarUrl: roomData.avatarUrl,
    avatarColorId: roomData.id,
    mediaRepository: mediaRepository,
  };

  const tilesCreator = makeTilesCreator({
    platform,
    roomVM: {
      room,
    },
    timeline,
    urlCreator: urlRouter,
    navigation,
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
  //console.log('eventEntries', eventEntries);

  // We have to use `timeline._setupEntries([])` because it sets
  // `this._allEntries` in `Timeline` and we don't want to use `timeline.load()`
  // to request remote things.
  timeline._setupEntries([]);
  // Make it safe to iterate a derived observable collection
  timeline.entries.subscribe({ onAdd: () => null, onUpdate: () => null });
  // We use the timeline to setup the relations between entries
  timeline.addEntries(eventEntries);

  //console.log('timeline.entries', timeline.entries.length, timeline.entries);

  const tiles = new TilesCollection(timeline.entries, tilesCreator);
  // Trigger onSubscribeFirst -> tiles._populateTiles();
  tiles.subscribe({ onAdd: () => null, onUpdate: () => null });

  // Make the lazy-load images appear
  for (const tile of tiles) {
    tile.notifyVisible();
  }

  const timelineViewModel = {
    showJumpDown: false,
    setVisibleTileRange: () => {},
    tiles: tiles,
  };

  // const view = new TimelineView(timelineViewModel);

  // const roomViewModel = {
  //   kind: 'room',
  //   timelineViewModel,
  //   composerViewModel: {
  //     kind: 'none',
  //   },
  //   i18n: RoomViewModel.prototype.i18n,

  //   id: roomData.id,
  //   name: roomData.name,
  //   avatarUrl(size) {
  //     return getAvatarHttpUrl(roomData.avatarUrl, size, platform, mediaRepository);
  //   },
  // };

  const roomViewModel = new RoomViewModel({
    room,
    ownUserId: 'xxx',
    platform,
    urlCreator: urlRouter,
    navigation,
  });

  roomViewModel._timelineVM = timelineViewModel;
  roomViewModel._composerVM = {
    kind: 'none',
  };

  class CalendarViewModel extends ViewModel {
    constructor(options) {
      super(options);
      const { activeDate, calendarDate } = options;
      this._activeDate = activeDate;
      this._calendarDate = calendarDate;
    }

    get activeDate() {
      return this._activeDate;
    }

    get calendarDate() {
      return this._calendarDate;
    }

    linkForDate(date) {
      // Gives the date in YYYY-mm-dd format.
      // date.toISOString() -> 2022-02-16T23:20:04.709Z
      const urlDate = date.toISOString().split('T')[0].replaceAll('-', '/');

      return urlJoin(config.basePath, `${room.id}/date/${urlDate}`);
    }

    prevMonth() {
      const prevMonthDate = new Date(this._calendarDate);
      prevMonthDate.setMonth(this._date.getMonth() - 1);
      this._calendarDate = prevMonthDate;
      this.emitChange('date');
    }

    nextMonth() {
      const nextMonthDate = new Date(this._calendarDate);
      nextMonthDate.setMonth(this._date.getMonth() + 1);
      this._calendarDate = nextMonthDate;
      this.emitChange('date');
    }
  }

  const fromDate = new Date(fromTimestamp);
  const archiveViewModel = {
    roomViewModel,
    rightPanelModel: {
      activeViewModel: {
        type: 'custom',
        customView: RightPanelContentView,
        calendarViewModel: new CalendarViewModel({
          // The day being shown in the archive
          activeDate: fromDate,
          // The month displayed in the calendar
          calendarDate: fromDate,
        }),
      },
    },
  };

  const view = new ArchiveView(archiveViewModel);

  //console.log('view.mount()', view.mount());
  app.replaceChildren(view.mount());
}

// N.B.: When we run this in a `vm`, it will return the last statement. It's
// important to leave this as the last statement so we can await the promise it
// returns and signal that all of the async tasks completed.
mountHydrogen();
