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
  tileClassForEntry,
  EventEntry,
  encodeKey,
  encodeEventIdKey,
  Timeline,
  RoomViewModel,
} = require('hydrogen-view-sdk');

const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');

const ArchiveRoomView = require('matrix-public-archive-shared/views/ArchiveRoomView');
const ArchiveHistory = require('matrix-public-archive-shared/lib/archive-history');

const ArchiveRoomViewModel = require('matrix-public-archive-shared/viewmodels/ArchiveRoomViewModel');

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

const matrixPublicArchiveURLCreator = new MatrixPublicArchiveURLCreator(config.basePath);

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

// For any `<a href="">` (anchor with a blank href), instead of reloading the
// page just remove the hash. Also cleanup whenever the hash changes for
// whatever reason.
//
// For example, when closing the lightbox by clicking the close "x" icon, it
// would reload the page instead of SPA because `href=""` will cause a page
// navigation if we didn't have this code. Also cleanup whenever the hash is
// emptied out (like when pressing escape in the lightbox).
function supressBlankAnchorsReloadingThePage() {
  const eventHandler = {
    clearHash() {
      // Cause a `hashchange` event to be fired
      document.location.hash = '';
      // Cleanup the leftover `#` left on the URL
      window.history.replaceState(null, null, window.location.pathname);
    },
    handleEvent(e) {
      // For any `<a href="">` (anchor with a blank href), instead of reloading
      // the page just remove the hash.
      if (
        e.type === 'click' &&
        e.target.tagName?.toLowerCase() === 'a' &&
        e.target?.getAttribute('href') === ''
      ) {
        this.clearHash();
        // Prevent the page navigation (reload)
        e.preventDefault();
      }
      // Also cleanup whenever the hash is emptied out (like when pressing escape in the lightbox)
      else if (e.type === 'hashchange' && document.location.hash === '') {
        this.clearHash();
      }
    },
  };

  document.addEventListener('click', eventHandler);
  window.addEventListener('hashchange', eventHandler);
}

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

  const archiveHistory = new ArchiveHistory(roomData.id);
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
    tileClassForEntry,
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
  const fromDate = new Date(fromTimestamp);
  const dateString = fromDate.toISOString().split('T')[0];
  Object.defineProperty(roomViewModel, 'composerViewModel', {
    get() {
      return {
        kind: 'disabled',
        description: [
          `You're viewing an archive of events from ${dateString}. Use a `,
          tag.a(
            {
              href: matrixPublicArchiveURLCreator.permalinkForRoomId(roomData.id),
              rel: 'noopener',
              target: '_blank',
            },
            ['Matrix client']
          ),
          ` to start chatting in this room.`,
        ],
      };
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
    fromDate,
    eventEntriesByEventId,
    basePath: config.basePath,
  });

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
