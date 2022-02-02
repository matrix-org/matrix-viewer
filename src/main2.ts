import {
  Platform,
  createNavigation,
  createRouter,
  MediaRepository,

  BaseObservableList,
  FragmentIdComparer,
  tilesCreator as makeTilesCreator,
  EventEntry,
  encodeKey,
  encodeEventIdKey,
  TimelineView
} from "hydrogen-view-sdk";

import eventsJson from './events2.json'

class TilesCollection extends BaseObservableList {
  constructor(tiles) {
    super();
    this._tiles = tiles;
}

  [Symbol.iterator]() {
    return this._tiles.values();
  }

  get length() {
    return this._tiles.length;
  }

  getFirst() {
    return this._tiles[0];
  }

  getTileIndex(searchTile) {
    const foundTileIndex = this._tiles.findIndex((tile) => {
      return searchTile.compare(tile);
    });

    return foundTileIndex;
  }

  sliceIterator(start, end) {
    return this._tiles.slice(start, end)[Symbol.iterator]();
  }
}


const fragmentIdComparer = new FragmentIdComparer([]);
function makeEventEntryFromEventJson(eventJson) {
  const eventEntry = new EventEntry({
    "fragmentId": 0,
    "eventIndex": 2147483648, // TODO: What should this be?
    "roomId": eventJson.room_id,
    "event": eventJson,
    "displayName": "todo",
    "avatarUrl": "mxc://matrix.org/todo",
    "key": encodeKey(eventJson.room_id, 0, 0),
    "eventIdKey": encodeEventIdKey(eventJson.room_id, eventJson.event_id)
  }, fragmentIdComparer);

  return eventEntry;
}


async function asdf() {
  const app = document.querySelector<HTMLDivElement>('#app2')!
  
  const config = {};
  const assetPaths = {};
  const platform = new Platform(app, assetPaths, config, { development: import.meta.env.DEV });

  const tilesCreator = makeTilesCreator({
    platform,
    roomVM: {
      room: {
        mediaRepository: new MediaRepository({
          homeserver: 'https://matrix-client.matrix.org'
        })
      }
    },
    timeline: {
      me: false,
    },
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
      }
    }
  });

  console.log('eventsJson', eventsJson)
  const eventEntries = eventsJson.map((eventJson) => {
    return makeEventEntryFromEventJson(eventJson);
  });
  console.log('eventEntries', eventEntries)

  
  // mimic _addLocalRelationsToNewRemoteEntries from Timeline.js
  for (const eventEntry of eventEntries) {
    // this will work because we set relatedEventId when removing remote echos
    if (eventEntry.relatedEventId) {
      console.log('related', eventEntry.relatedEventId, eventEntry)
        const relationTarget = eventEntries.find(e => e.id === eventEntry.relatedEventId);
        console.log('relationTarget', relationTarget)
        // no need to emit here as this entry is about to be added
        relationTarget?.addLocalRelation(eventEntry);
    }
    if (eventEntry.redactingEntry) {
        const eventId = eventEntry.redactingEntry.relatedEventId;
        const relationTarget = eventEntries.find(e => e.id === eventId);
        relationTarget?.addLocalRelation(eventEntry);
    }
  }

  // mimic _loadContextEntriesWhereNeeded from Timeline.js
  for (const entry of eventEntries) {
      if (!entry.contextEventId) {
          continue;
      }
      const id = entry.contextEventId;
      let contextEvent = eventEntries.find(e => e.id === id);
      if (contextEvent) {
          entry.setContextEntry(contextEvent);
          // we don't emit an update here, as the add or update
          // that the callee will emit hasn't been emitted yet.
      }
  }

  const rawTiles = eventEntries
    .map((entry) => {
      return tilesCreator(entry);
    })
    .filter((tile) => !!tile);
  
  // Make the lazy-load images appear
  rawTiles.forEach((tile) => {
    tile.notifyVisible();
  })

  console.log('rawTiles', rawTiles);
  const tiles = new TilesCollection(rawTiles);

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

  app.appendChild(view.mount());
}

asdf();
