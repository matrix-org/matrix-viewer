'use strict';

// Isomorphic script that runs in the browser and on the server for SSR (needs
// browser context) that renders Hydrogen to the `document.body`.
//
// Data is passed in via `window.matrixPublicArchiveContext`

const assert = require('matrix-public-archive-shared/lib/assert');
const { Platform, Navigation, createRouter } = require('hydrogen-view-sdk');

const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');
const ArchiveHistory = require('matrix-public-archive-shared/lib/archive-history');
const supressBlankAnchorsReloadingThePage = require('matrix-public-archive-shared/lib/supress-blank-anchors-reloading-the-page');

const RoomDirectoryView = require('matrix-public-archive-shared/views/RoomDirectoryView');
const RoomDirectoryViewModel = require('matrix-public-archive-shared/viewmodels/RoomDirectoryViewModel');

const rooms = window.matrixPublicArchiveContext.rooms;
assert(rooms);
const nextPaginationToken = window.matrixPublicArchiveContext.nextPaginationToken;
const prevPaginationToken = window.matrixPublicArchiveContext.prevPaginationToken;
const searchTerm = window.matrixPublicArchiveContext.searchTerm;
const config = window.matrixPublicArchiveContext.config;
assert(config);
assert(config.matrixServerUrl);
assert(config.matrixServerName);
assert(config.basePath);

const matrixPublicArchiveURLCreator = new MatrixPublicArchiveURLCreator(config.basePath);

supressBlankAnchorsReloadingThePage();

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

  const archiveHistory = new ArchiveHistory(`#`);
  const urlRouter = createRouter({
    navigation,
    history: archiveHistory,
  });
  // Make it listen to changes from the history instance. And populate the
  // `Navigation` with path segments to work from so `href`'s rendered on the
  // page don't say `undefined`.
  urlRouter.attach();

  const roomDirectoryViewModel = new RoomDirectoryViewModel({
    // Hydrogen options
    navigation: navigation,
    urlCreator: urlRouter,
    history: archiveHistory,
    // Our options
    homeserverUrl: config.matrixServerUrl,
    homeserverName: config.matrixServerName,
    matrixPublicArchiveURLCreator,
    rooms,
    searchTerm,
    nextPaginationToken,
    prevPaginationToken,
  });
  roomDirectoryViewModel.loadAddedHomserversListFromPersistence();

  const view = new RoomDirectoryView(roomDirectoryViewModel);

  appElement.replaceChildren(view.mount());
  console.timeEnd('Completed mounting Hydrogen');
}

// N.B.: When we run this in a virtual machine (`vm`), it will return the last
// statement. It's important to leave this as the last statement so we can await
// the promise it returns and signal that all of the async tasks completed.
mountHydrogen();
