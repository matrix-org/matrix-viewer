'use strict';

// Isomorphic script that runs in the browser and on the server for SSR (needs
// browser context) that renders Hydrogen to the `document.body`.
//
// Data is passed in via `window.matrixViewerContext`

const assert = require('matrix-viewer-shared/lib/assert');
const { Platform, Navigation, createRouter } = require('hydrogen-view-sdk');

const MatrixViewerURLCreator = require('matrix-viewer-shared/lib/url-creator');
const MatrixViewerHistory = require('matrix-viewer-shared/lib/matrix-viewer-history');
const supressBlankAnchorsReloadingThePage = require('matrix-viewer-shared/lib/supress-blank-anchors-reloading-the-page');
const redirectIfRoomAliasInHash = require('matrix-viewer-shared/lib/redirect-if-room-alias-in-hash');

const RoomDirectoryView = require('matrix-viewer-shared/views/RoomDirectoryView');
const RoomDirectoryViewModel = require('matrix-viewer-shared/viewmodels/RoomDirectoryViewModel');

const rooms = window.matrixViewerContext.rooms;
assert(rooms);
const roomFetchError = window.matrixViewerContext.roomFetchError;
const nextPaginationToken = window.matrixViewerContext.nextPaginationToken;
const prevPaginationToken = window.matrixViewerContext.prevPaginationToken;
const pageSearchParameters = window.matrixViewerContext.pageSearchParameters;
const config = window.matrixViewerContext.config;
assert(config);
assert(config.matrixServerUrl);
assert(config.matrixServerName);
assert(config.basePath);

const matrixViewerURLCreator = new MatrixViewerURLCreator(config.basePath);

supressBlankAnchorsReloadingThePage();

let roomDirectoryViewModel;
let isRedirecting = false;
isRedirecting = redirectIfRoomAliasInHash(matrixViewerURLCreator, () => {
  isRedirecting = true;
  if (roomDirectoryViewModel) {
    roomDirectoryViewModel.setPageRedirectingFromUrlHash(true);
  }
});

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

  function allowsChild(parent, child) {
    const { type } = child;
    switch (parent?.type) {
      case undefined:
        // allowed root segments
        return type === 'add-server';
      default:
        return false;
    }
  }

  const navigation = new Navigation(allowsChild);
  platform.setNavigation(navigation);

  const matrixViewerHistory = new MatrixViewerHistory(`#`);
  const urlRouter = createRouter({
    navigation,
    history: matrixViewerHistory,
  });
  // Make it listen to changes from the history instance. And populate the
  // `Navigation` with path segments to work from so `href`'s rendered on the
  // page don't say `undefined`.
  urlRouter.attach();

  roomDirectoryViewModel = new RoomDirectoryViewModel({
    // Hydrogen options
    navigation: navigation,
    urlRouter: urlRouter,
    history: matrixViewerHistory,
    // Our options
    basePath: config.basePath,
    homeserverUrl: config.matrixServerUrl,
    homeserverName: config.matrixServerName,
    matrixViewerURLCreator,
    rooms,
    roomFetchError,
    pageSearchParameters,
    nextPaginationToken,
    prevPaginationToken,
  });
  // Update the model with the initial value
  roomDirectoryViewModel.setPageRedirectingFromUrlHash(isRedirecting);

  const view = new RoomDirectoryView(roomDirectoryViewModel);

  appElement.replaceChildren(view.mount());
  console.timeEnd('Completed mounting Hydrogen');
}

// N.B.: When we run this in a virtual machine (`vm`), it will return the last
// statement. It's important to leave this as the last statement so we can await
// the promise it returns and signal that all of the async tasks completed.
mountHydrogen();
