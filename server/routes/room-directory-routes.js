'use strict';

const assert = require('assert');
const path = require('path');
const urlJoin = require('url-join');
const express = require('express');
const asyncHandler = require('../lib/express-async-handler');

const fetchPublicRooms = require('../lib/matrix-utils/fetch-public-rooms');
const renderHydrogenVmRenderScriptToPageHtml = require('../hydrogen-render/render-hydrogen-vm-render-script-to-page-html');

const config = require('../lib/config');
const basePath = config.get('basePath');
assert(basePath);
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);
const matrixServerName = config.get('matrixServerName');
assert(matrixServerName);
const matrixAccessToken = config.get('matrixAccessToken');
assert(matrixAccessToken);
const stopSearchEngineIndexing = config.get('stopSearchEngineIndexing');

const router = express.Router({
  caseSensitive: true,
  // Preserve the req.params values from the parent router.
  mergeParams: true,
});

router.get(
  '/',
  asyncHandler(async function (req, res) {
    const paginationToken = req.query.page;
    const searchTerm = req.query.search;
    const homeserver = req.query.homeserver;

    // It would be good to grab more rooms than we display in case we need
    // to filter any out but then the pagination tokens with the homeserver
    // will be out of sync. XXX: It would be better if we could just filter
    // `/publicRooms` directly via the API (needs MSC).
    const limit = 9;

    let rooms = [];
    let nextPaginationToken;
    let prevPaginationToken;
    let roomFetchError;
    try {
      ({ rooms, nextPaginationToken, prevPaginationToken } = await fetchPublicRooms(
        matrixAccessToken,
        {
          server: homeserver,
          searchTerm,
          paginationToken,
          limit,
        }
      ));
    } catch (err) {
      roomFetchError = err;
    }

    // We index the room directory unless the config says we shouldn't index anything
    const shouldIndex = !stopSearchEngineIndexing;

    const hydrogenStylesUrl = urlJoin(basePath, '/hydrogen-styles.css');
    const stylesUrl = urlJoin(basePath, '/css/styles.css');
    const roomDirectoryStylesUrl = urlJoin(basePath, '/css/room-directory.css');
    const jsBundleUrl = urlJoin(basePath, '/js/entry-client-room-directory.es.js');

    const pageHtml = await renderHydrogenVmRenderScriptToPageHtml(
      path.resolve(__dirname, '../../shared/room-directory-vm-render-script.js'),
      {
        rooms,
        roomFetchError: roomFetchError
          ? {
              message: roomFetchError.message,
              stack: roomFetchError.stack,
            }
          : null,
        nextPaginationToken,
        prevPaginationToken,
        pageSearchParameters: {
          homeserver: homeserver || matrixServerName,
          searchTerm,
          paginationToken,
          limit,
        },
        config: {
          basePath,
          matrixServerUrl,
          matrixServerName,
        },
      },
      {
        title: `Matrix Public Archive`,
        styles: [hydrogenStylesUrl, stylesUrl, roomDirectoryStylesUrl],
        scripts: [jsBundleUrl],
        shouldIndex,
        cspNonce: res.locals.cspNonce,
      }
    );

    res.set('Content-Type', 'text/html');
    res.send(pageHtml);
  })
);

module.exports = router;
