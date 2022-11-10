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

  RetainedObservableValue,
  PowerLevels,
} = require('hydrogen-view-sdk');

const ArchiveRoomView = require('matrix-public-archive-shared/views/ArchiveRoomView');
const ArchiveHistory = require('matrix-public-archive-shared/lib/archive-history');
const supressBlankAnchorsReloadingThePage = require('matrix-public-archive-shared/lib/supress-blank-anchors-reloading-the-page');
const ArchiveRoomViewModel = require('matrix-public-archive-shared/viewmodels/ArchiveRoomViewModel');

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

function addSupportClasses() {
  const input = document.createElement('input');
  input.type = 'month';
  const isMonthTypeSupported = input.type === 'month';

  // Signal `<input type="month">` support to our CSS
  document.body.classList.toggle('fallback-input-month', !isMonthTypeSupported);
}

supressBlankAnchorsReloadingThePage();

// eslint-disable-next-line max-statements
async function mountHydrogen() {
  console.log('Mounting Hydrogen...');
  console.time('Completed mounting Hydrogen');
  const appElement = document.querySelector('#app');

  const qs = new URLSearchParams(window?.location?.search);
  const scrollStartEventId = qs.get('at');

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

  const mediaRepository = new MediaRepository({
    homeserver: config.matrixServerUrl,
  });

  const room = {
    name: roomData.name,
    id: roomData.id,
    canonicalAlias: roomData.canonicalAlias,
    avatarUrl: roomData.avatarUrl,
    avatarColorId: roomData.id,
    // Hydrogen options used by the event TilesCollection (roomVM)
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

  const archiveRoomViewModel = new ArchiveRoomViewModel({
    // Hydrogen options
    platform: platform,
    navigation: navigation,
    urlRouter: urlRouter,
    history: archiveHistory,
    // Our options
    homeserverUrl: config.matrixServerUrl,
    room,
    // The timestamp from the URL that was originally visited
    dayTimestampFrom: fromTimestamp,
    dayTimestampTo: toTimestamp,
    scrollStartEventId,
    events,
    stateEventMap,
    shouldIndex,
    basePath: config.basePath,
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
