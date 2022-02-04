import {
  Platform,
  createNavigation,
  createRouter,
  MediaRepository,
  TilesCollection,
  FragmentIdComparer,
  tilesCreator as makeTilesCreator,
  EventEntry,
  encodeKey,
  encodeEventIdKey,
  Timeline,
  TimelineView,
} from 'hydrogen-view-sdk';

const roomId = '!OWqptMTjnQfUWubCid:matrix.org';
import eventsJson from './events2.json';

let eventIndexCounter = 0;
const fragmentIdComparer = new FragmentIdComparer([]);
function makeEventEntryFromEventJson(roomId, eventJson) {
  console.assert(roomId);
  console.assert(eventJson);

  const eventIndex = eventIndexCounter;
  const eventEntry = new EventEntry(
    {
      fragmentId: 0,
      eventIndex: eventIndex, // TODO: What should this be?
      roomId: roomId,
      event: eventJson,
      displayName: 'todo',
      avatarUrl: 'mxc://matrix.org/todo',
      key: encodeKey(roomId, 0, eventIndex),
      eventIdKey: encodeEventIdKey(roomId, eventJson.event_id),
    },
    fragmentIdComparer
  );

  eventIndexCounter++;

  return eventEntry;
}

async function asdf() {
  const app = document.querySelector('#app2');

  const config = {};
  const assetPaths = {};
  const platform = new Platform(app, assetPaths, config, { development: import.meta.env.DEV });

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
          homeserver: 'https://matrix-client.matrix.org',
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

  console.log('eventsJson', eventsJson);
  const eventEntries = eventsJson.map((eventJson) => {
    return makeEventEntryFromEventJson(roomId, eventJson);
  });
  console.log('eventEntries', eventEntries);

  // We have to use `timeline._setupEntries([])` because it sets
  // `this._allEntries` in `Timeline` and we don't want to use `timeline.load()`
  // to request remote things.
  timeline._setupEntries([]);
  // Make it safe to iterate a derived observable collection
  timeline.entries.subscribe({ onAdd: () => null, onUpdate: () => null });
  timeline.addEntries(eventEntries);

  console.log('timeline.entries', timeline.entries.length, timeline.entries);

  const tiles = new TilesCollection(timeline.entries, tilesCreator);
  // Trigger onSubscribeFirst -> tiles._populateTiles();
  tiles.subscribe({ onAdd: () => null, onUpdate: () => null });

  // Make the lazy-load images appear
  for (const tile of tiles) {
    tile.notifyVisible();
  }

  // const navigation = createNavigation();
  // const urlRouter = createRouter({
  //     navigation: navigation,
  //     history: {}
  // });
  // urlRouter.attach();

  const timelineViewModel = {
    showJumpDown: false,
    setVisibleTileRange: () => {},
    tiles: tiles,
  };

  const view = new TimelineView(timelineViewModel);

  console.log('view.mount()', view.mount());
  app.appendChild(view.mount());
  //app.insertAdjacentHTML('beforeend', view.mount());
}

asdf();
