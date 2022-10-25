'use strict';

const assert = require('assert');
const path = require('path');
const urlJoin = require('url-join');
const express = require('express');
const asyncHandler = require('../lib/express-async-handler');
const StatusError = require('../lib/status-error');

const timeoutMiddleware = require('./timeout-middleware');
const redirectToCorrectArchiveUrlIfBadSigil = require('./redirect-to-correct-archive-url-if-bad-sigil-middleware');

const fetchRoomData = require('../lib/matrix-utils/fetch-room-data');
const fetchEventsFromTimestampBackwards = require('../lib/matrix-utils/fetch-events-from-timestamp-backwards');
const ensureRoomJoined = require('../lib/matrix-utils/ensure-room-joined');
const timestampToEvent = require('../lib/matrix-utils/timestamp-to-event');
const renderHydrogenVmRenderScriptToPageHtml = require('../hydrogen-render/render-hydrogen-vm-render-script-to-page-html');
const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');

const config = require('../lib/config');
const basePath = config.get('basePath');
assert(basePath);
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);
const matrixAccessToken = config.get('matrixAccessToken');
assert(matrixAccessToken);

const matrixPublicArchiveURLCreator = new MatrixPublicArchiveURLCreator(basePath);

const router = express.Router({
  caseSensitive: true,
  // Preserve the req.params values from the parent router.
  mergeParams: true,
});

const VALID_ENTITY_DESCRIPTOR_TO_SIGIL_MAP = {
  r: '#',
  roomid: '!',
};
const validSigilList = Object.values(VALID_ENTITY_DESCRIPTOR_TO_SIGIL_MAP);
const sigilRe = new RegExp(`^(${validSigilList.join('|')})`);

function getRoomIdOrAliasFromReq(req) {
  const entityDescriptor = req.params.entityDescriptor;
  // This could be with or with our without the sigil. Although the correct thing here
  // is to have no sigil. We will try to correct it for them in any case.
  const roomIdOrAliasDirty = req.params.roomIdOrAliasDirty;
  const roomIdOrAliasWithoutSigil = roomIdOrAliasDirty.replace(sigilRe, '');

  const sigil = VALID_ENTITY_DESCRIPTOR_TO_SIGIL_MAP[entityDescriptor];
  if (!sigil) {
    throw new Error(
      `Unknown entityDescriptor=${entityDescriptor} has no sigil. This is an error with the Matrix Public Archive itself (please open an issue).`
    );
  }

  return `${sigil}${roomIdOrAliasWithoutSigil}`;
}

function parseArchiveRangeFromReq(req) {
  const yyyy = parseInt(req.params.yyyy, 10);
  // Month is the only zero-based index in this group
  const mm = parseInt(req.params.mm, 10) - 1;
  const dd = parseInt(req.params.dd, 10);

  const hourRange = req.params.hourRange;

  let fromHour = 0;
  let toHour = 0;
  if (hourRange) {
    const hourMatches = hourRange.match(/^(\d\d?)-(\d\d?)$/);

    if (!hourMatches) {
      throw new StatusError(404, 'Hour was unable to be parsed');
    }

    fromHour = parseInt(hourMatches[1], 10);
    toHour = parseInt(hourMatches[2], 10);

    if (Number.isNaN(fromHour) || fromHour < 0 || fromHour > 23) {
      throw new StatusError(404, 'From hour can only be in range 0-23');
    }
  }

  const fromTimestamp = Date.UTC(yyyy, mm, dd, fromHour);
  let toTimestamp = Date.UTC(yyyy, mm, dd + 1, fromHour);
  if (hourRange) {
    toTimestamp = Date.UTC(yyyy, mm, dd, toHour);
  }

  return {
    fromTimestamp,
    toTimestamp,
    yyyy,
    mm,
    dd,
    hourRange,
    fromHour,
    toHour,
  };
}

router.use(redirectToCorrectArchiveUrlIfBadSigil);

router.get(
  '/',
  asyncHandler(async function (req, res) {
    const roomIdOrAlias = getRoomIdOrAliasFromReq(req);

    // In case we're joining a new room for the first time,
    // let's avoid redirecting to our join event by getting
    // the time before we join and looking backwards.
    const dateBeforeJoin = Date.now();

    // We have to wait for the room join to happen first before we can fetch
    // any of the additional room info or messages.
    const roomId = await ensureRoomJoined(matrixAccessToken, roomIdOrAlias, req.query.via);

    // Find the closest day to today with messages
    const { originServerTs } = await timestampToEvent({
      accessToken: matrixAccessToken,
      roomId,
      ts: dateBeforeJoin,
      direction: 'b',
    });
    if (!originServerTs) {
      throw new StatusError(404, 'Unable to find day with history');
    }

    // Redirect to a day with messages
    res.redirect(
      matrixPublicArchiveURLCreator.archiveUrlForDate(roomIdOrAlias, new Date(originServerTs), {
        viaServers: req.query.via,
      })
    );
  })
);

router.get(
  '/event/:eventId',
  asyncHandler(async function (req, res) {
    // TODO: Fetch event to get `origin_server_ts` and redirect to
    // /!roomId/2022/01/01?at=$eventId
    res.send('todo');
  })
);

router.get(
  '/jump',
  asyncHandler(async function (req, res) {
    const roomIdOrAlias = getRoomIdOrAliasFromReq(req);

    const ts = parseInt(req.query.ts, 10);
    assert(!Number.isNaN(ts), '?ts query parameter must be a number');
    const dir = req.query.dir;
    assert(['f', 'b'].includes(dir), '?dir query parameter must be [f|b]');

    // Find the closest day to today with messages
    const { originServerTs } = await timestampToEvent({
      accessToken: matrixAccessToken,
      roomId: roomIdOrAlias,
      ts: ts,
      direction: dir,
    });
    if (!originServerTs) {
      throw new StatusError(404, 'Unable to find day with history');
    }

    // Redirect to a day with messages
    res.redirect(
      matrixPublicArchiveURLCreator.archiveUrlForDate(roomIdOrAlias, new Date(originServerTs))
    );
  })
);

// Based off of the Gitter archive routes,
// https://gitlab.com/gitterHQ/webapp/-/blob/14954e05c905e8c7cb675efebb89116c07cfaab5/server/handlers/app/archive.js#L190-297
router.get(
  '/date/:yyyy(\\d{4})/:mm(\\d{2})/:dd(\\d{2})/:hourRange(\\d\\d?-\\d\\d?)?',
  timeoutMiddleware,
  asyncHandler(async function (req, res) {
    const roomIdOrAlias = getRoomIdOrAliasFromReq(req);

    const archiveMessageLimit = config.get('archiveMessageLimit');
    assert(archiveMessageLimit);
    // Synapse has a max `/messages` limit of 1000
    assert(
      archiveMessageLimit <= 999,
      'archiveMessageLimit needs to be in range [1, 999]. We can only get 1000 messages at a time from Synapse and we need a buffer of at least one to see if there are too many messages on a given day so you can only configure a max of 999. If you need more messages, we will have to implement pagination'
    );

    const { fromTimestamp, toTimestamp, hourRange, fromHour, toHour } =
      parseArchiveRangeFromReq(req);

    // If the hourRange is defined, we force the range to always be 1 hour. If
    // the format isn't correct, redirect to the correct hour range
    if (hourRange && toHour !== fromHour + 1) {
      // Pass through the query parameters
      let queryParamterUrlPiece = '';
      if (req.query) {
        queryParamterUrlPiece = `?${new URLSearchParams(req.query).toString()}`;
      }

      res.redirect(
        // FIXME: Can we use the matrixPublicArchiveURLCreator here?
        `${urlJoin(
          basePath,
          roomIdOrAlias,
          'date',
          req.params.yyyy,
          req.params.mm,
          req.params.dd,
          `${fromHour}-${fromHour + 1}`
        )}${queryParamterUrlPiece}`
      );
      return;
    }

    // TODO: Highlight tile that matches ?at=$xxx
    //const aroundId = req.query.at;

    // We have to wait for the room join to happen first before we can fetch
    // any of the additional room info or messages.
    const roomId = await ensureRoomJoined(matrixAccessToken, roomIdOrAlias, req.query.via);

    // Do these in parallel to avoid the extra time in sequential round-trips
    // (we want to display the archive page faster)
    const [roomData, { events, stateEventMap }] = await Promise.all([
      fetchRoomData(matrixAccessToken, roomId),
      // We over-fetch messages outside of the range of the given day so that we
      // can display messages from surrounding days (currently only from days
      // before) so that the quiet rooms don't feel as desolate and broken.
      fetchEventsFromTimestampBackwards({
        accessToken: matrixAccessToken,
        roomId,
        ts: toTimestamp,
        // We fetch one more than the `archiveMessageLimit` so that we can see
        // there are too many messages from the given day. If we have over the
        // `archiveMessageLimit` number of messages fetching from the given day,
        // it's acceptable to have them be from surrounding days. But if all 500
        // messages (for example) are from the same day, let's redirect to a
        // smaller hour range to display.
        limit: archiveMessageLimit + 1,
      }),
    ]);

    // Only `world_readable` or `shared` rooms that are `public` are viewable in the archive
    const allowedToViewRoom =
      roomData?.historyVisibility === 'world_readable' ||
      (roomData?.historyVisibility === 'shared' && roomData?.joinRule === 'public');

    if (!allowedToViewRoom) {
      throw new StatusError(
        403,
        `Only \`world_readable\` or \`shared\` rooms that are \`public\` can be viewed in the archive. ${roomData.id} has m.room.history_visiblity=${roomData?.historyVisibility} m.room.join_rules=${roomData?.joinRule}`
      );
    }

    // We only allow search engines to index `world_readable` rooms
    const shouldIndex = roomData?.historyVisibility === `world_readable`;

    // If we have over the `archiveMessageLimit` number of messages fetching
    // from the given day, it's acceptable to have them be from surrounding
    // days. But if all 500 messages (for example) are from the same day, let's
    // redirect to a smaller hour range to display.
    if (
      // If there are too many messages, check that the event is from a previous
      // day in the surroundings.
      events.length >= archiveMessageLimit &&
      // Since we're only fetching previous days for the surroundings, we only
      // need to look at the oldest event in the chronological list.
      //
      // XXX: In the future when we also fetch events from days after, we will
      // need next day check.
      events[0].origin_server_ts >= fromTimestamp
    ) {
      res.send('TODO: Redirect user to smaller hour range');
      res.status(204);
      return;
    }

    const hydrogenStylesUrl = urlJoin(basePath, '/hydrogen-styles.css');
    const stylesUrl = urlJoin(basePath, '/css/styles.css');
    const jsBundleUrl = urlJoin(basePath, '/js/entry-client-hydrogen.es.js');

    const pageHtml = await renderHydrogenVmRenderScriptToPageHtml(
      path.resolve(__dirname, '../../shared/hydrogen-vm-render-script.js'),
      {
        fromTimestamp,
        toTimestamp,
        roomData,
        events,
        stateEventMap,
        shouldIndex,
        config: {
          basePath: basePath,
          matrixServerUrl: matrixServerUrl,
        },
      },
      {
        title: `${roomData.name} - Matrix Public Archive`,
        styles: [hydrogenStylesUrl, stylesUrl],
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
