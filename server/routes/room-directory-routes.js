'use strict';

const assert = require('assert');
const path = require('path');
const urlJoin = require('url-join');
const express = require('express');
const asyncHandler = require('../lib/express-async-handler');

const { DIRECTION } = require('matrix-public-archive-shared/lib/reference-values');
const RouteTimeoutAbortError = require('../lib/errors/route-timeout-abort-error');
const UserClosedConnectionAbortError = require('../lib/errors/user-closed-connection-abort-error');
const identifyRoute = require('../middleware/identify-route-middleware');
const fetchAccessibleRooms = require('../lib/matrix-utils/fetch-accessible-rooms');
const renderHydrogenVmRenderScriptToPageHtml = require('../hydrogen-render/render-hydrogen-vm-render-script-to-page-html');
const setHeadersToPreloadAssets = require('../lib/set-headers-to-preload-assets');

const config = require('../lib/config');
const basePath = config.get('basePath');
assert(basePath);
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);
const matrixServerName = config.get('matrixServerName');
assert(matrixServerName);
const matrixAccessToken = config.get('matrixAccessToken');
assert(matrixAccessToken);

const router = express.Router({
  caseSensitive: true,
  // Preserve the req.params values from the parent router.
  mergeParams: true,
});

router.get(
  '/',
  identifyRoute('app-room-directory-index'),
  asyncHandler(async function (req, res) {
    const searchTerm = req.query.search;
    const homeserver = req.query.homeserver;
    const paginationToken = req.query.page;
    const direction = req.query.dir;

    // You must provide both `paginationToken` and `direction` if either is defined
    if (paginationToken || direction) {
      assert(
        [DIRECTION.forward, DIRECTION.backward].includes(direction),
        '?dir query parameter must be [f|b]'
      );
      assert(paginationToken, '?page query parameter must be defined if ?dir is defined');
    }

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
      ({ rooms, nextPaginationToken, prevPaginationToken } = await fetchAccessibleRooms(
        matrixAccessToken,
        {
          server: homeserver,
          searchTerm,
          paginationToken,
          direction,
          limit,
          abortSignal: req.abortSignal,
        }
      ));
    } catch (err) {
      if (err instanceof RouteTimeoutAbortError || err instanceof UserClosedConnectionAbortError) {
        // Throw an error so we stop processing and assembling the page after we abort
        throw err;
      } else {
        // Otherwise, this will be the error we will display on the page for the user to
        // explain why we failed to fetch the rooms they wanted.
        roomFetchError = err;
      }
    }

    // We index the room directory unless the config says we shouldn't index anything
    const stopSearchEngineIndexingFromConfig = config.get('stopSearchEngineIndexing');
    const shouldIndex = !stopSearchEngineIndexingFromConfig;

    const pageOptions = {
      title: `Matrix Public Archive`,
      description:
        'Browse thousands of rooms using Matrix. The new portal into the Matrix ecosystem.',
      entryPoint: 'client/js/entry-client-room-directory.js',
      locationUrl: urlJoin(basePath, req.originalUrl),
      shouldIndex,
      cspNonce: res.locals.cspNonce,
    };
    const pageHtml = await renderHydrogenVmRenderScriptToPageHtml({
      pageOptions,
      vmRenderScriptFilePath: path.resolve(
        __dirname,
        '../../shared/room-directory-vm-render-script.js'
      ),
      vmRenderContext: {
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
      abortSignal: req.abortSignal,
    });

    setHeadersToPreloadAssets(res, pageOptions);

    res.set('Content-Type', 'text/html');
    res.send(pageHtml);
  })
);

module.exports = router;
