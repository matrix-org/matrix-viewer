'use strict';

const assert = require('assert');
const path = require('path');
const urlJoin = require('url-join');
const express = require('express');
const asyncHandler = require('../lib/express-async-handler');

const renderHydrogenVmRenderScriptToPageHtml = require('../hydrogen-render/render-hydrogen-vm-render-script-to-page-html');

const config = require('../lib/config');
const basePath = config.get('basePath');
assert(basePath);

const router = express.Router({
  caseSensitive: true,
  // Preserve the req.params values from the parent router.
  mergeParams: true,
});

router.get(
  '/',
  asyncHandler(async function (req, res) {
    const hydrogenStylesUrl = urlJoin(basePath, '/css/hydrogen-styles.css');
    const stylesUrl = urlJoin(basePath, '/css/styles.css');
    const roomDirectoryStylesUrl = urlJoin(basePath, '/css/room-directory.css');
    const jsBundleUrl = urlJoin(basePath, '/js/entry-client-room-directory.es.js');

    const pageHtml = await renderHydrogenVmRenderScriptToPageHtml(
      path.resolve(__dirname, '../../shared/room-directory-vm-render-script.js'),
      {
        searchTerm: 'foobar',
        config: {
          basePath: config.get('basePath'),
        },
      },
      {
        title: `Matrix Public Archive`,
        styles: [hydrogenStylesUrl, stylesUrl, roomDirectoryStylesUrl],
        scripts: [jsBundleUrl],
      }
    );

    res.set('Content-Type', 'text/html');
    res.send(pageHtml);
  })
);

module.exports = router;
