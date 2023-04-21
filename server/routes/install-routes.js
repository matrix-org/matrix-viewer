import path from 'path';
import express from 'express';
import cors from 'cors';
import asyncHandler from '../lib/express-async-handler';

import { handleTracingMiddleware } from '../tracing/tracing-middleware';
import getVersionTags from '../lib/get-version-tags';
import preventClickjackingMiddleware from '../middleware/prevent-clickjacking-middleware';
import contentSecurityPolicyMiddleware from '../middleware/content-security-policy-middleware';
import identifyRoute from '../middleware/identify-route-middleware';
import clientSideRoomAliasHashRedirectRoute from './client-side-room-alias-hash-redirect-route';
import redirectToCorrectArchiveUrlIfBadSigil from '../middleware/redirect-to-correct-archive-url-if-bad-sigil-middleware';

function installRoutes(app) {
  app.use(handleTracingMiddleware);
  app.use(preventClickjackingMiddleware);
  app.use(contentSecurityPolicyMiddleware);
  app.use(cors());

  let healthCheckResponse;
  app.get(
    '/health-check',
    identifyRoute('health-check'),
    asyncHandler(async function (req, res) {
      if (!healthCheckResponse) {
        const versionTags = getVersionTags();
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
  app.use(
    '/hydrogen-assets',
    // eslint-disable-next-line node/no-missing-require
    express.static(path.dirname(require.resolve('hydrogen-view-sdk/assets/main.js')))
  );

  app.get(
    // This has to be at the root so that the font URL references resolve correctly
    '/hydrogen-assets/hydrogen-styles.css',
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
  app.use('/img', express.static(path.join(__dirname, '../../public/img')));
  app.use('/js', express.static(path.join(__dirname, '../../dist/')));

  app.use('/', require('./room-directory-routes'));

  // For room aliases (/r) or room ID's (/roomid)
  app.use('/:entityDescriptor(r|roomid)/:roomIdOrAliasDirty', require('./room-routes'));

  // Since everything after the hash (`#`) won't make it to the server, let's serve a 404
  // page that will potentially redirect them to the correct place if they tried
  // `/r/#room-alias:server/date/2022/10/27` -> `/r/room-alias:server/date/2022/10/27`
  app.get(
    '/:entityDescriptor(r|roomid)',
    identifyRoute('client-side-room-alias-hash-redirect'),
    clientSideRoomAliasHashRedirectRoute
  );

  // Correct any honest mistakes: If someone accidentally put the sigil in the URL, then
  // redirect them to the correct URL without the sigil to the correct path above.
  app.get(
    '/:roomIdOrAliasDirty',
    identifyRoute('redirect-to-correct-archive-url-if-bad-sigil'),
    redirectToCorrectArchiveUrlIfBadSigil
  );
}

export default installRoutes;
