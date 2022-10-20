'use strict';

// Isomorphic script that runs in the browser and on the server for SSR (needs
// browser context) that renders Hydrogen to the `document.body`.
//
// Data is passed in via `window.matrixPublicArchiveContext`

const assert = require('matrix-public-archive-shared/lib/assert');

const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');

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

async function mountHydrogen() {
  console.log('Mounting Hydrogen...');
  console.time('Completed mounting Hydrogen');
  const appElement = document.querySelector('#app');

  const roomDirectoryViewModel = new RoomDirectoryViewModel({
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
