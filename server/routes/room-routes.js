'use strict';

const assert = require('assert');
const path = require('path');
const urlJoin = require('url-join');
const express = require('express');
const asyncHandler = require('../lib/express-async-handler');
const StatusError = require('../lib/status-error');

const timeoutMiddleware = require('./timeout-middleware');
const redirectToCorrectArchiveUrlIfBadSigil = require('./redirect-to-correct-archive-url-if-bad-sigil-middleware');

const { HTTPResponseError } = require('../lib/fetch-endpoint');
const fetchRoomData = require('../lib/matrix-utils/fetch-room-data');
const fetchEventsFromTimestampBackwards = require('../lib/matrix-utils/fetch-events-from-timestamp-backwards');
const ensureRoomJoined = require('../lib/matrix-utils/ensure-room-joined');
const timestampToEvent = require('../lib/matrix-utils/timestamp-to-event');
const getMessagesResponseFromEventId = require('../lib/matrix-utils/get-messages-response-from-event-id');
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
        // We can avoid passing along the `via` query parameter because we already
        // joined the room above (see `ensureRoomJoined`).
        //
        //viaServers: req.query.via,
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
  // eslint-disable-next-line max-statements
  asyncHandler(async function (req, res) {
    const roomIdOrAlias = getRoomIdOrAliasFromReq(req);

    const ts = parseInt(req.query.ts, 10);
    assert(!Number.isNaN(ts), '?ts query parameter must be a number');
    const dir = req.query.dir;
    assert(['f', 'b'].includes(dir), '?dir query parameter must be [f|b]');

    // We have to wait for the room join to happen first before we can use the jump to
    // date endpoint
    const roomId = await ensureRoomJoined(matrixAccessToken, roomIdOrAlias, req.query.via);

    let eventIdForTimestamp;
    let originServerTs;
    try {
      // Find the closest day to today with messages
      ({ eventId: eventIdForTimestamp, originServerTs } = await timestampToEvent({
        accessToken: matrixAccessToken,
        roomId,
        ts: ts,
        direction: dir,
      }));

      // The goal is to go forward 100 messages, so that when we view the room at that
      // point going backwards 100 messages, we end up at the perfect sam continuation
      // spot in the room.
      //
      // XXX: This is flawed in the fact that when we go `/messages?dir=b` later, it
      // could backfill messages which will fill up the response before we perfectly
      // connect and continue from the position they were jumping from before. When
      // `/messages?dir=f` backfills, we won't have this problem anymore because any
      // messages backfilled in the forwards direction would be picked up the same going
      // backwards.
      if (dir === 'f') {
        // Use `/messages?dir=f` and get the `end` pagination token to paginate from. And
        // then start the scroll from the top of the page so they can continue.
        const archiveMessageLimit = config.get('archiveMessageLimit');
        const messageResData = await getMessagesResponseFromEventId({
          accessToken: matrixAccessToken,
          roomId,
          eventId: eventIdForTimestamp,
          dir: 'f',
          limit: archiveMessageLimit,
        });

        if (!messageResData.chunk?.length) {
          throw new StatusError(
            404,
            `/messages response didn't contain any more messages to jump to`
          );
        }

        const timestampOfLastMessage =
          messageResData.chunk[messageResData.chunk.length - 1].origin_server_ts;
        const dateOfLastMessage = new Date(timestampOfLastMessage);

        // Back track from the last message timestamp to the date boundary. This will
        // gurantee some overlap with the previous page we jumped from so we don't lose
        // any messages in the gap.
        //
        // XXX: This date boundary logic may need to change once we introduce hour
        // chunks or time slices
        // (https://github.com/matrix-org/matrix-public-archive/issues/7). For example
        // if we reached into the next day but it has too many messages to show for a
        // given page, we would want to back track until a suitable time slice boundary.
        // Maybe we need to add a new URL parameter here `?time-slice=true` to indicate
        // that it's okay to break it up by time slice based on previously having to
        // view by time slice. We wouldn't want to give
        const utcMidnightOfDayBefore = Date.UTC(
          dateOfLastMessage.getUTCFullYear(),
          dateOfLastMessage.getUTCMonth(),
          dateOfLastMessage.getUTCDate()
        );
        // We minus 1 from UTC midnight to get to the day before
        const endOfDayBeforeDate = new Date(utcMidnightOfDayBefore - 1);

        originServerTs = endOfDayBeforeDate;
      }
    } catch (err) {
      const is404Error = err instanceof HTTPResponseError && err.response.status === 404;
      // Only throw if it's something other than a 404 error. 404 errors are fine, they
      // just mean there is no more messages to paginate in that room.
      if (!is404Error) {
        throw err;
      }
    }

    // If we can't find any more messages to paginate to, just progress the date by a
    // day in whatever direction they wanted to go so we can display the empty view for
    // that day.
    if (!originServerTs) {
      const tsDate = new Date(ts);
      const yyyy = tsDate.getUTCFullYear();
      const mm = tsDate.getUTCMonth();
      const dd = tsDate.getUTCDate();

      const newDayDelta = dir === 'f' ? 1 : -1;
      originServerTs = Date.UTC(yyyy, mm, dd + newDayDelta);
    }

    // Redirect to a day with messages
    res.redirect(
      // TODO: Add query parameter that causes the client to start the scroll at the top
      // when jumping forwards so they can continue reading where they left off.
      matrixPublicArchiveURLCreator.archiveUrlForDate(roomIdOrAlias, new Date(originServerTs), {
        // Start the scroll at the next event from where they jumped from (seamless navigation)
        scrollStartEventId: eventIdForTimestamp,
      })
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

    // Just 404 if anyone is trying to view the future, no need to waste resources on that
    const nowTs = Date.now();
    if (fromTimestamp > nowTs) {
      throw new StatusError(
        404,
        `You can't view the history of a room on a future day (${new Date(
          fromTimestamp
        ).toISOString()} > ${new Date(nowTs).toISOString()}). Go back`
      );
    }

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
      // need to change this next day check.
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
        roomData: {
          ...roomData,
          // The `canonicalAlias` will take precedence over the `roomId` when present so we only
          // want to use it if that's what the user originally browsed to. We shouldn't
          // try to switch someone over to the room alias if they browsed from the room
          // ID or vice versa.
          canonicalAlias:
            roomIdOrAlias === roomData.canonicalAlias ? roomData.canonicalAlias : undefined,
        },
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
