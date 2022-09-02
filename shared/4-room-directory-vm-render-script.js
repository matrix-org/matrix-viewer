'use strict';

// Isomorphic script that runs in the browser and on the server for SSR (needs
// browser context) that renders Hydrogen to the `document.body`.
//
// Data is passed in via `window.matrixPublicArchiveContext`

const assert = require('matrix-public-archive-shared/lib/assert');

const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');

const RoomDirectoryView = require('matrix-public-archive-shared/views/RoomDirectoryView');
const RoomDirectoryViewModel = require('matrix-public-archive-shared/viewmodels/RoomDirectoryViewModel');

const searchTerm = window.matrixPublicArchiveContext.searchTerm;
assert(searchTerm);
const config = window.matrixPublicArchiveContext.config;
assert(config);
assert(config.basePath);

async function mountHydrogen() {
  const appElement = document.querySelector('#app');

  const roomDirectoryViewModel = new RoomDirectoryViewModel({});

  const view = new RoomDirectoryView(roomDirectoryViewModel);

  appElement.replaceChildren(view.mount());
}

// N.B.: When we run this in a virtual machine (`vm`), it will return the last
// statement. It's important to leave this as the last statement so we can await
// the promise it returns and signal that all of the async tasks completed.
mountHydrogen();
