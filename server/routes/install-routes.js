'use strict';

const path = require('path');
const express = require('express');
const asyncHandler = require('../lib/express-async-handler');

const { handleTracingMiddleware } = require('../tracing/tracing-middleware');
const getVersionTags = require('../lib/get-version-tags');

function installRoutes(app) {
  app.use(handleTracingMiddleware);

  let healthCheckResponse;
  app.get(
    '/health-check',
    asyncHandler(async function (req, res) {
      if (!healthCheckResponse) {
        const versionTags = await getVersionTags();
        const responseObject = {
          ok: true,
          ...versionTags,
        };
        healthCheckResponse = JSON.stringify(responseObject, null, 2);
      }

      res.set('Content-Type', 'application/json');
      res.send(healthCheckResponse);
    })
  );

  // We have to disable no-missing-require lint because it doesn't take into
  // account `package.json`. `exports`, see
  // https://github.com/mysticatea/eslint-plugin-node/issues/255
  // eslint-disable-next-line node/no-missing-require
  app.use(express.static(path.dirname(require.resolve('hydrogen-view-sdk/assets/main.js'))));

  app.get(
    '/css/hydrogen-styles.css',
    asyncHandler(async function (req, res) {
      res.set('Content-Type', 'text/css');
      // We have to disable no-missing-require lint because it doesn't take into
      // account `package.json`. `exports`, see
      // https://github.com/mysticatea/eslint-plugin-node/issues/255
      // eslint-disable-next-line node/no-missing-require
      res.sendFile(require.resolve('hydrogen-view-sdk/assets/theme-element-light.css'));
    })
  );

  // Our own archive app styles and scripts
  app.use('/css', express.static(path.join(__dirname, '../../public/css')));
  app.use('/js', express.static(path.join(__dirname, '../../public/*.js')));

  app.use('/', require('./room-directory-routes'));

  app.use('/:roomIdOrAlias', require('./room-routes'));
}

module.exports = installRoutes;
