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
  RoomView,
  RoomViewModel,
} = require('hydrogen-view-sdk');

const ArchiveView = require('matrix-public-archive-shared/ArchiveView');
const RightPanelContentView = require('matrix-public-archive-shared/RightPanelContentView');

const roomData = global.INPUT_ROOM_DATA;
assert(roomData);
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

  const eventIndex = eventIndexCounter;
  const eventEntry = new EventEntry(
    {
      fragmentId: 0,
      eventIndex: eventIndex, // TODO: What should this be?
      roomId: roomId,
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

  const mediaRepository = new MediaRepository({
    homeserver: config.matrixServerUrl,
  });

  const urlCreator = {
    urlUntilSegment: () => {
      return 'todo';
    },
    urlForSegments: () => {
      return 'todo';
    },
  };

  const navigation = {
    segment: () => {
      return 'todo';
    },
  };

  const tilesCreator = makeTilesCreator({
    platform,
    roomVM: {
      room: {
        mediaRepository,
      },
    },
    timeline,
    urlCreator,
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

  const room = {
    name: roomData.name,
    id: roomData.id,
    avatarUrl: roomData.avatarUrl,
    avatarColorId: roomData.id,
    mediaRepository: mediaRepository,
  };

  const roomViewModel = new RoomViewModel({
    room,
    ownUserId: 'xxx',
    platform,
    urlCreator,
    navigation,
  });

  roomViewModel._timelineVM = timelineViewModel;
  roomViewModel._composerVM = {
    kind: 'none',
  };

  const archiveViewModel = {
    roomViewModel,
    rightPanelModel: {
      activeViewModel: {
        type: 'custom',
        customView: RightPanelContentView,
      },
    },
  };

  const view = new ArchiveView(archiveViewModel);

  //console.log('view.mount()', view.mount());
  app.appendChild(view.mount());
}

mountHydrogen();
