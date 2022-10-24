'use strict';

// Isomorphic script that runs in the browser and on the server for SSR (needs
// browser context) that renders Hydrogen to the `document.body`.
//
// Data is passed in via `window.matrixPublicArchiveContext`

const assert = require('matrix-public-archive-shared/lib/assert');
const {
  Platform,
  MediaRepository,
  createNavigation,
  createRouter,
  tag,

  RetainedObservableValue,
  PowerLevels,

  TilesCollection,
  FragmentIdComparer,
  EventEntry,
  encodeKey,
  encodeEventIdKey,
  Timeline,
  ViewModel,
  RoomViewModel,
} = require('hydrogen-view-sdk');

const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');
const ArchiveRoomView = require('matrix-public-archive-shared/views/ArchiveRoomView');
const ArchiveHistory = require('matrix-public-archive-shared/lib/archive-history');
const supressBlankAnchorsReloadingThePage = require('matrix-public-archive-shared/lib/supress-blank-anchors-reloading-the-page');
const ArchiveRoomViewModel = require('matrix-public-archive-shared/viewmodels/ArchiveRoomViewModel');
const {
  customTileClassForEntry,
} = require('matrix-public-archive-shared/lib/custom-tile-utilities');

const fromTimestamp = window.matrixPublicArchiveContext.fromTimestamp;
assert(fromTimestamp);
const toTimestamp = window.matrixPublicArchiveContext.toTimestamp;
assert(toTimestamp);
const roomData = window.matrixPublicArchiveContext.roomData;
assert(roomData);
const events = window.matrixPublicArchiveContext.events;
assert(events);
const stateEventMap = window.matrixPublicArchiveContext.stateEventMap;
assert(stateEventMap);
const shouldIndex = window.matrixPublicArchiveContext.shouldIndex;
assert(shouldIndex !== undefined);
const config = window.matrixPublicArchiveContext.config;
assert(config);
assert(config.matrixServerUrl);
assert(config.basePath);

const matrixPublicArchiveURLCreator = new MatrixPublicArchiveURLCreator(config.basePath);

let txnCount = 0;
function getFakeEventId() {
  txnCount++;
  return `fake-event-id-${new Date().getTime()}--${txnCount}`;
}

function addSupportClasses() {
  const input = document.createElement('input');
  input.type = 'month';
  const isMonthTypeSupported = input.type === 'month';

  // Signal `<input type="month">` support to our CSS
  document.body.classList.toggle('fallback-input-month', !isMonthTypeSupported);
}

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

supressBlankAnchorsReloadingThePage();

// eslint-disable-next-line max-statements
async function mountHydrogen() {
  console.log('Mounting Hydrogen...');
  console.time('Completed mounting Hydrogen');
  const appElement = document.querySelector('#app');

  const platformConfig = {};
  const assetPaths = {};
  const platform = new Platform({
    container: appElement,
    assetPaths,
    config: platformConfig,
    options: { development: true },
  });

  const navigation = createNavigation();
  platform.setNavigation(navigation);

  const archiveHistory = new ArchiveHistory(`#/session/123/room/${roomData.id}`);
  const urlRouter = createRouter({
    navigation: navigation,
    // We use our own history because we want the hash to be relative to the
    // room and not include the session/room.
    //
    // Normally, people use `history: platform.history,`
    history: archiveHistory,
  });
  // Make it listen to changes from the history instance. And populate the
  // `Navigation` with path segments to work from so `href`'s rendered on the
  // page don't say `undefined`.
  urlRouter.attach();

  // We use the timeline to setup the relations between entries
  const timeline = new Timeline({
    roomId: roomData.id,
    fragmentIdComparer: fragmentIdComparer,
    clock: platform.clock,
    logger: platform.logger,
  });

  const mediaRepository = new MediaRepository({
    homeserver: config.matrixServerUrl,
  });

  const room = {
    name: roomData.name,
    id: roomData.id,
    avatarUrl: roomData.avatarUrl,
    avatarColorId: roomData.id,
    mediaRepository: mediaRepository,
    // Based on https://github.com/vector-im/hydrogen-web/blob/5f9cfffa3b547991b665f57a8bf715270a1b2ef1/src/matrix/room/BaseRoom.js#L480
    observePowerLevels: async function () {
      let powerLevelsObservable = this._powerLevelsObservable;
      if (!powerLevelsObservable) {
        const powerLevels = new PowerLevels({
          powerLevelEvent: {},
          ownUserId: 'xxx-ownUserId',
          membership: null,
        });
        powerLevelsObservable = new RetainedObservableValue(powerLevels, () => {
          this._powerLevels = null;
        });
        this._powerLevelsObservable = powerLevelsObservable;
      }
      return powerLevelsObservable;
    },
  };

  // Something we can modify with new state updates as we see them
  const workingStateEventMap = {
    ...stateEventMap,
  };

  // Add a summary item to the bottom of the timeline that explains if we found
  // events on the day requested.
  const hasEventsFromGivenDay = events[events.length - 1]?.origin_server_ts >= fromTimestamp;
  let daySummaryKind;
  if (events.length === 0) {
    daySummaryKind = 'no-events-at-all';
  } else if (hasEventsFromGivenDay) {
    daySummaryKind = 'some-events-in-day';
  } else if (!hasEventsFromGivenDay) {
    daySummaryKind = 'no-events-in-day';
  }
  events.push({
    event_id: getFakeEventId(),
    type: 'org.matrix.archive.not_enough_events_from_day_summary',
    room_id: roomData.id,
    // Even though this isn't used for sort, just using the time where the event
    // would logically be.
    //
    // -1 so we're not at 00:00:00 of the next day
    origin_server_ts: toTimestamp - 1,
    content: {
      daySummaryKind: daySummaryKind,
      // The timestamp from the URL that was originally visited
      dayTimestamp: fromTimestamp,
      // The end of the range to use as a jumping off point to the next activity
      rangeEndTimestamp: toTimestamp,
      // This is a bit cheating but I don't know how else to pass this kind of
      // info to the Tile viewmodel
      basePath: config.basePath,
    },
  });

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
    platform,
    navigation,
    urlCreator: urlRouter,
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

  const timelineViewModel = {
    showJumpDown: false,
    setVisibleTileRange: () => {},
    tiles,
  };

  const roomViewModel = new RoomViewModel({
    room,
    // This is an arbitrary string (doesn't need to match anything and it shouldn't)
    ownUserId: 'xxx-ownUserId',
    platform,
    urlCreator: urlRouter,
    navigation,
  });

  roomViewModel.openRightPanel = function () {
    let path = this.navigation.path.until('room');
    path = path.with(this.navigation.segment('right-panel', true));
    path = path.with(this.navigation.segment('change-dates', true));
    this.navigation.applyPath(path);
  };

  roomViewModel.roomDirectoryUrl = matrixPublicArchiveURLCreator.roomDirectoryUrl();

  Object.defineProperty(roomViewModel, 'timelineViewModel', {
    get() {
      return timelineViewModel;
    },
  });

  const archiveRoomViewModel = new ArchiveRoomViewModel({
    // Hydrogen options
    navigation: navigation,
    urlCreator: urlRouter,
    history: archiveHistory,
    // Our options
    roomViewModel,
    room,
    fromDate: new Date(fromTimestamp),
    eventEntriesByEventId,
    shouldIndex,
    basePath: config.basePath,
  });

  // Create a custom disabled composer view that shows our archive message.
  class DisabledArchiveComposerViewModel extends ViewModel {
    constructor(options) {
      super(options);

      // Whenever the `archiveRoomViewModel.currentTopPositionEventEntry`
      // changes, re-render the composer view with the updated date.
      archiveRoomViewModel.on('change', (changedProps) => {
        if (changedProps === 'currentTopPositionEventEntry') {
          this.emitChange();
        }
      });
    }

    get kind() {
      return 'disabled';
    }

    get description() {
      return [
        (/*vm*/) => {
          const activeDate = new Date(
            // If the date from our `archiveRoomViewModel` is available, use that
            archiveRoomViewModel?.currentTopPositionEventEntry?.timestamp ||
              // Otherwise, use our initial `fromTimestamp`
              fromTimestamp
          );
          const dateString = activeDate.toISOString().split('T')[0];
          return `You're viewing an archive of events from ${dateString}. Use a `;
        },
        tag.a(
          {
            href: matrixPublicArchiveURLCreator.permalinkForRoom(roomData.id),
            rel: 'noopener',
            target: '_blank',
          },
          ['Matrix client']
        ),
        ` to start chatting in this room.`,
      ];
    }
  }
  const disabledArchiveComposerViewModel = new DisabledArchiveComposerViewModel({});
  Object.defineProperty(roomViewModel, 'composerViewModel', {
    get() {
      return disabledArchiveComposerViewModel;
    },
  });

  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------

  // Render what we actually care about
  const view = new ArchiveRoomView(archiveRoomViewModel);
  appElement.replaceChildren(view.mount());

  addSupportClasses();
  supressBlankAnchorsReloadingThePage();

  console.timeEnd('Completed mounting Hydrogen');
}

// N.B.: When we run this in a virtual machine (`vm`), it will return the last
// statement. It's important to leave this as the last statement so we can await
// the promise it returns and signal that all of the async tasks completed.
mountHydrogen();
