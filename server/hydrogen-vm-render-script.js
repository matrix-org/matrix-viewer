const assert = require('assert');
const {
  Platform,
  MediaRepository,

  TilesCollection,
  FragmentIdComparer,
  tilesCreator: makeTilesCreator,
  EventEntry,
  encodeKey,
  encodeEventIdKey,
  Timeline,
  TimelineView,
} = require('hydrogen-view-sdk');

const events = global.INPUT_EVENTS;
assert(events);
const stateEventMap = global.INPUT_STATE_EVENT_MAP;
assert(stateEventMap);
const config = global.INPUT_CONFIG;
assert(config);
assert(config.matrixServerUrl);

let eventIndexCounter = 0;
const fragmentIdComparer = new FragmentIdComparer([]);
function makeEventEntryFromEventJson(eventJson, memberEvent) {
  assert(eventJson);
  assert(memberEvent);

  const eventIndex = eventIndexCounter;
  const eventEntry = new EventEntry(
    {
      fragmentId: 0,
      eventIndex: eventIndex, // TODO: What should this be?
      roomId: roomId,
      event: eventJson,
      displayName: memberEvent.content && memberEvent.content.displayname,
      avatarUrl: memberEvent.content && memberEvent.content.avatar_url,
      key: encodeKey(roomId, 0, eventIndex),
      eventIdKey: encodeEventIdKey(roomId, eventJson.event_id),
    },
    fragmentIdComparer
  );

  eventIndexCounter++;

  return eventEntry;
}

async function mountHydrogen() {
  const app = document.querySelector('#app');

  const platformConfig = {};
  const assetPaths = {};
  const platform = new Platform(app, assetPaths, platformConfig, { development: true });

  // We use the timeline to setup the relations between entries
  const timeline = new Timeline({
    roomId: roomId,
    //storage: this._storage,
    fragmentIdComparer: fragmentIdComparer,
    clock: platform.clock,
    logger: platform.logger,
    //hsApi: this._hsApi
  });

  const tilesCreator = makeTilesCreator({
    platform,
    roomVM: {
      room: {
        mediaRepository: new MediaRepository({
          homeserver: config.matrixServerUrl,
        }),
      },
    },
    timeline,
    urlCreator: {
      urlUntilSegment: () => {
        return 'todo';
      },
      urlForSegments: () => {
        return 'todo';
      },
    },
    navigation: {
      segment: () => {
        return 'todo';
      },
    },
  });

  const eventEntries = events.map((event) => {
    const memberEvent = stateEventMap[event.user_id];
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

  const view = new TimelineView(timelineViewModel);

  //console.log('view.mount()', view.mount());
  app.appendChild(view.mount());
}

mountHydrogen();
