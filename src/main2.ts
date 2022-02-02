import {
  Platform,
  createNavigation,
  createRouter,

  BaseObservableList,
  FragmentIdComparer,
  tilesCreator as makeTilesCreator,
  EventEntry,
  encodeKey,
  encodeEventIdKey,
  TimelineView
} from "hydrogen-view-sdk";

import events1 from './events1.json'

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
        // todo
        mediaRepository: {
          mxcUrlThumbnail: () => {
            return 'todo';
          }
        }
      }
    },
    timeline: {
      me: false,
    },
    urlCreator: {
      urlUntilSegment: () => {
        return 'todo';
      }
    }
  });

  console.log('events1', events1)
  const eventEntries = events1.map((eventJson) => {
    return makeEventEntryFromEventJson(eventJson);
  });
  console.log('eventEntries', eventEntries)
  const rawTiles = eventEntries
    .map((entry) => {
      return tilesCreator(entry);
    })
    .filter((tile) => !!tile);

  console.log('rawTiles', rawTiles)
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
