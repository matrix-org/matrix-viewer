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
const {
  MS_LOOKUP,
  TIME_PRECISION_VALUES,
} = require('matrix-public-archive-shared/lib/reference-values');
const { ONE_DAY_IN_MS, ONE_HOUR_IN_MS, ONE_MINUTE_IN_MS, ONE_SECOND_IN_MS } = MS_LOOKUP;

const config = require('../lib/config');
const basePath = config.get('basePath');
assert(basePath);
const matrixServerUrl = config.get('matrixServerUrl');
assert(matrixServerUrl);
const matrixAccessToken = config.get('matrixAccessToken');
assert(matrixAccessToken);
const stopSearchEngineIndexing = config.get('stopSearchEngineIndexing');

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

// eslint-disable-next-line complexity
function parseArchiveRangeFromReq(req) {
  const yyyy = parseInt(req.params.yyyy, 10);
  // Month is the only zero-based index in this group
  const mm = parseInt(req.params.mm, 10) - 1;
  const dd = parseInt(req.params.dd, 10);

  const timeString = req.params.time;
  let timeInMs = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  if (timeString) {
    const timeMatches = timeString.match(/^T(\d\d?):(\d\d?)(?::(\d\d?))?$/);

    if (!timeMatches) {
      throw new StatusError(
        404,
        'Time was unable to be parsed from URL. It should be in 24-hour format 23:59:59'
      );
    }

    hour = timeMatches[1] && parseInt(timeMatches[1], 10);
    minute = timeMatches[2] && parseInt(timeMatches[2], 10);
    second = timeMatches[3] ? parseInt(timeMatches[3], 10) : 0;

    if (Number.isNaN(hour) || hour < 0 || hour > 23) {
      throw new StatusError(404, `Hour can only be in range 0-23 -> ${hour}`);
    }
    if (Number.isNaN(minute) || minute < 0 || minute > 59) {
      throw new StatusError(404, `Minute can only be in range 0-59 -> ${minute}`);
    }
    if (Number.isNaN(second) || second < 0 || second > 59) {
      throw new StatusError(404, `Second can only be in range 0-59 -> ${second}`);
    }

    const hourInMs = hour * 60 * 60 * 1000;
    const minuteInMs = minute * 60 * 1000;
    const secondInMs = second * 1000;

    timeInMs = hourInMs + minuteInMs + secondInMs;
  }

  const fromTimestamp = Date.UTC(yyyy, mm, dd);
  // We `- 1` to get the timestamp that is a millisecond before the next day
  let toTimestamp = Date.UTC(yyyy, mm, dd + 1) - 1;
  if (timeInMs) {
    toTimestamp = fromTimestamp + timeInMs;
  }

  return {
    fromTimestamp,
    toTimestamp,
    yyyy,
    mm,
    dd,
    hour,
    minute,
    second,
    timeInMs,
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
  // eslint-disable-next-line max-statements, complexity
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
      console.log('timestamp_to_event found', eventIdForTimestamp, originServerTs);

      // The goal is to go forward 100 messages, so that when we view the room at that
      // point going backwards 100 messages, we end up at the perfect continuation
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

        console.log('dateOfLastMessage', dateOfLastMessage);

        // Back-track from the last message timestamp to the nearest date boundary.
        // Because we're back-tracking a couple events here, when paginate back out by
        // the `archiveMessageLimit` later in the room route, it will gurantee some
        // overlap with the previous page we jumped from so we don't lose any messages
        // in the gap.
        const msGapFromJumpPointToLastMessage = timestampOfLastMessage - ts;
        const moreThanDayGap = msGapFromJumpPointToLastMessage > ONE_DAY_IN_MS;
        const moreThanHourGap = msGapFromJumpPointToLastMessage > ONE_HOUR_IN_MS;
        const moreThanMinuteGap = msGapFromJumpPointToLastMessage > ONE_MINUTE_IN_MS;
        const moreThanSecondGap = msGapFromJumpPointToLastMessage > ONE_SECOND_IN_MS;

        console.log('moreThanDayGap', moreThanDayGap);
        console.log('moreThanHourGap', moreThanHourGap);
        console.log('moreThanMinuteGap', moreThanMinuteGap);
        console.log('moreThanSecondGap', moreThanSecondGap);

        // More than a day gap here, so we can just back-track to the nearest day
        if (moreThanDayGap) {
          const utcMidnightOfDayBefore = Date.UTC(
            dateOfLastMessage.getUTCFullYear(),
            dateOfLastMessage.getUTCMonth(),
            dateOfLastMessage.getUTCDate()
          );
          // We minus 1 from UTC midnight to get to the day before
          const endOfDayBeforeTs = utcMidnightOfDayBefore - 1;
          originServerTs = endOfDayBeforeTs;
        }
        // More than a hour gap here, we will need to back-track to the nearest hour
        else if (moreThanHourGap) {
          const utcTopOfHourBefore = Date.UTC(
            dateOfLastMessage.getUTCFullYear(),
            dateOfLastMessage.getUTCMonth(),
            dateOfLastMessage.getUTCDate(),
            dateOfLastMessage.getUTCHours()
          );
          originServerTs = utcTopOfHourBefore;
        }
        // More than a minute gap here, we will need to back-track to the nearest minute
        else if (moreThanMinuteGap) {
          const utcTopOfMinuteBefore = Date.UTC(
            dateOfLastMessage.getUTCFullYear(),
            dateOfLastMessage.getUTCMonth(),
            dateOfLastMessage.getUTCDate(),
            dateOfLastMessage.getUTCHours(),
            dateOfLastMessage.getUTCMinutes()
          );
          originServerTs = utcTopOfMinuteBefore;
        }
        // More than a second gap here, we will need to back-track to the nearest second
        else if (moreThanSecondGap) {
          const utcTopOfSecondBefore = Date.UTC(
            dateOfLastMessage.getUTCFullYear(),
            dateOfLastMessage.getUTCMonth(),
            dateOfLastMessage.getUTCDate(),
            dateOfLastMessage.getUTCHours(),
            dateOfLastMessage.getUTCMinutes(),
            dateOfLastMessage.getUTCSeconds()
          );
          originServerTs = utcTopOfSecondBefore;
        }
        // Less than a second gap here, we will give up
        else {
          res.send(
            `Too many messages were sent all within a second for us to display (more than ${archiveMessageLimit} in one second). We're unable to redirect you to a smaller time range to view them without losing a few between each page. Since this is probably pretty rare, we've decided not to support it for now.`
          );
          // 204 No Content
          res.status(204);
          return;
        }
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

    console.log(
      'redirecting to ',
      originServerTs,
      new Date(originServerTs).toISOString(),
      eventIdForTimestamp
    );

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
  // The extra set of parenthesis around `((:\\d\\d?)?)` is to work around a
  // `path-to-regex` bug where the `?` wasn't attaching to the capture group, see
  // https://github.com/pillarjs/path-to-regexp/issues/287
  '/date/:yyyy(\\d{4})/:mm(\\d{2})/:dd(\\d{2}):time(T\\d\\d?:\\d\\d?((:\\d\\d?)?))?',
  timeoutMiddleware,
  // eslint-disable-next-line max-statements, complexity
  asyncHandler(async function (req, res) {
    const roomIdOrAlias = getRoomIdOrAliasFromReq(req);

    const archiveMessageLimit = config.get('archiveMessageLimit');
    assert(archiveMessageLimit);
    // Synapse has a max `/messages` limit of 1000
    assert(
      archiveMessageLimit <= 999,
      'archiveMessageLimit needs to be in range [1, 999]. We can only get 1000 messages at a time from Synapse and we need a buffer of at least one to see if there are too many messages on a given day so you can only configure a max of 999. If you need more messages, we will have to implement pagination'
    );

    const { fromTimestamp, toTimestamp, timeInMs } = parseArchiveRangeFromReq(req);

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

    // Default to no indexing (safe default)
    let shouldIndex = false;
    if (stopSearchEngineIndexing) {
      shouldIndex = false;
    } else {
      // Otherwise we only allow search engines to index `world_readable` rooms
      shouldIndex = roomData?.historyVisibility === `world_readable`;
    }

    // If we have over the `archiveMessageLimit` number of messages fetching
    // from the given day, it's acceptable to have them be from surrounding
    // days. But if all 500 messages (for example) are from the same day, let's
    // redirect to a smaller hour range to display.
    if (
      // If there are too many messages, check ...
      events.length >= archiveMessageLimit
    ) {
      let preferredPrecision = null;

      // Check if first event is from the surroundings or not. Since we're only fetching
      // previous days for the surroundings, we only need to look at the oldest event in
      // the chronological list.
      //
      // XXX: In the future when we also fetch events from days after, we will
      // probably need to change this next day check.
      const isEventFromSurroundingDay = events[0].origin_server_ts < fromTimestamp;

      // If not specifying a time, then let's specify a time
      if (!timeInMs && !isEventFromSurroundingDay) {
        preferredPrecision = TIME_PRECISION_VALUES.minutes;
      }

      // If we're already specifying minutes in the time but there are too many messages
      // within the minute, let's go to seconds as well
      const isEventFromSurroundingMinute =
        toTimestamp - events[0].origin_server_ts > ONE_MINUTE_IN_MS;
      if (!isEventFromSurroundingMinute) {
        preferredPrecision = TIME_PRECISION_VALUES.seconds;
      }

      // If we're already specifying seconds in the time but there are too many messages within the
      // second, let's give up for now ⏩
      const isEventFromSurroundingSecond =
        toTimestamp - events[0].origin_server_ts > ONE_SECOND_IN_MS;
      if (!isEventFromSurroundingSecond) {
        res.send(
          `Too many messages were sent all within a second for us to display (more than ${archiveMessageLimit} in one second). We're unable to redirect you to a smaller time range to view them without losing a few between each page. Since this is probably pretty rare, we've decided not to support it for now.`
        );
        // 204 No Content
        res.status(204);
      }

      if (preferredPrecision) {
        console.log('redirecting preferredPrecision', preferredPrecision, new Date(toTimestamp));
        res.redirect(
          matrixPublicArchiveURLCreator.archiveUrlForDate(roomIdOrAlias, new Date(toTimestamp), {
            preferredPrecision,
            // We can avoid passing along the `via` query parameter because we already
            // joined the room above (see `ensureRoomJoined`).
            //
            //viaServers: req.query.via,
          })
        );
        return;
      }
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
        locationHref: urlJoin(basePath, req.originalUrl),
        shouldIndex,
        cspNonce: res.locals.cspNonce,
      }
    );

    res.set('Content-Type', 'text/html');
    res.send(pageHtml);
  })
);

module.exports = router;
