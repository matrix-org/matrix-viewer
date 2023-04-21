import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'path';
import express from 'express';
import cors from 'cors';
import asyncHandler from '../lib/express-async-handler.js';

import { handleTracingMiddleware } from '../tracing/tracing-middleware.js';
import getVersionTags from '../lib/get-version-tags.js';
import preventClickjackingMiddleware from '../middleware/prevent-clickjacking-middleware.js';
import contentSecurityPolicyMiddleware from '../middleware/content-security-policy-middleware.js';
import identifyRoute from '../middleware/identify-route-middleware.js';
import clientSideRoomAliasHashRedirectRoute from './client-side-room-alias-hash-redirect-route.js';
import redirectToCorrectArchiveUrlIfBadSigil from '../middleware/redirect-to-correct-archive-url-if-bad-sigil-middleware.js';

import roomDirectoryRoutes from './room-directory-routes.js';
import roomRoutes from './room-routes.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  app.use(
    '/hydrogen-assets',
    express.static(path.dirname(require.resolve('hydrogen-view-sdk/assets/main.js')))
  );

  app.get(
    '/hydrogen-assets/hydrogen-styles.css',
    asyncHandler(async function (req, res) {
      res.set('Content-Type', 'text/css');
      res.sendFile(require.resolve('hydrogen-view-sdk/assets/theme-element-light.css'));
    })
  );

  // Our own archive app styles and scripts
  app.use('/css', express.static(path.join(__dirname, '../../public/css')));
  app.use('/img', express.static(path.join(__dirname, '../../public/img')));
  app.use('/js', express.static(path.join(__dirname, '../../dist/')));

  app.use('/', roomDirectoryRoutes);

  // For room aliases (/r) or room ID's (/roomid)
  app.use('/:entityDescriptor(r|roomid)/:roomIdOrAliasDirty', roomRoutes);

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
