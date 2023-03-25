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
const {
  roundUpTimestampToHour,
  roundUpTimestampToMinute,
  roundUpTimestampToSecond,
  areTimestampsFromSameDay,
  areTimestampsFromSameHour,
  areTimestampsFromSameMinute,
  areTimestampsFromSameSecond,
} = require('matrix-public-archive-shared/lib/timestamp-utilities');

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

function getErrorStringForTooManyMessages(archiveMessageLimit) {
  const message =
    `Too many messages were sent all within a second for us to display ` +
    `(more than ${archiveMessageLimit} in one second). We're unable to redirect you to ` +
    `a smaller time range to view them without losing a few between each page. ` +
    `Since this is probably pretty rare, we've decided not to support it for now.`;
  return message;
}

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

// eslint-disable-next-line max-statements, complexity
function parseArchiveRangeFromReq(req) {
  const yyyy = parseInt(req.params.yyyy, 10);
  // Month is the only zero-based index in this group
  const mm = parseInt(req.params.mm, 10) - 1;
  const dd = parseInt(req.params.dd, 10);

  const timeString = req.params.time;
  let timeInMs = 0;
  let timeDefined = false;
  let secondsDefined = false;
  if (timeString) {
    const timeMatches = timeString.match(/^T(\d\d?):(\d\d?)(?::(\d\d?))?$/);

    if (!timeMatches) {
      throw new StatusError(
        404,
        'Time was unable to be parsed from URL. It should be in 24-hour format 23:59:59'
      );
    }

    const hour = timeMatches[1] && parseInt(timeMatches[1], 10);
    const minute = timeMatches[2] && parseInt(timeMatches[2], 10);
    const second = timeMatches[3] ? parseInt(timeMatches[3], 10) : 0;

    timeDefined = !!timeMatches;
    // Whether the timestamp included seconds
    secondsDefined = !!timeMatches[3];

    if (Number.isNaN(hour) || hour < 0 || hour > 23) {
      throw new StatusError(404, `Hour can only be in range 0-23 -> ${hour}`);
    }
    if (Number.isNaN(minute) || minute < 0 || minute > 59) {
      throw new StatusError(404, `Minute can only be in range 0-59 -> ${minute}`);
    }
    if (Number.isNaN(second) || second < 0 || second > 59) {
      throw new StatusError(404, `Second can only be in range 0-59 -> ${second}`);
    }

    const hourInMs = hour * ONE_HOUR_IN_MS;
    const minuteInMs = minute * ONE_MINUTE_IN_MS;
    const secondInMs = second * ONE_SECOND_IN_MS;

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
    // Whether the req included time `T23:59`
    timeDefined,
    // Whether the req included seconds in the time `T23:59:59`
    secondsDefined,
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

    // Find the closest day to the current time with messages
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

    let eventIdForClosestEvent;
    let tsForClosestEvent;
    let newOriginServerTs;
    let preferredPrecision = null;
    try {
      const archiveMessageLimit = config.get('archiveMessageLimit');

      console.log('jumping from ts', ts, new Date(ts).toISOString());

      // Find the closest event to the given timestamp
      ({ eventId: eventIdForClosestEvent, originServerTs: tsForClosestEvent } =
        await timestampToEvent({
          accessToken: matrixAccessToken,
          roomId,
          ts: ts,
          direction: dir,
        }));
      console.log(
        'timestamp_to_event found',
        eventIdForClosestEvent,
        tsForClosestEvent,
        new Date(tsForClosestEvent).toISOString()
      );

      // Based on what we found was the closest, figure out the URL that will represent
      // the next chunk in the desired direction.
      // ==============================
      //
      // Since a given room archive URL represents the end of the day/time-period
      // looking backward (scroll is also anchored to the bottom), we just need to get
      // the user to the previous time-period.
      //
      // We are trying to avoid sending the user to the same time period they were just
      // viewing. i.e, if they were visiting `/2020/01/02T23:59:59`, which had more
      // messages than we could display in that day, jumping backwards from the earliest
      // displayed event from `T16:00:00` would still give us the same day `/2020/01/02`
      // and we want to redirect them to previous chunk from that same day, like
      // `/2020/01/02T16:00:00`
      if (dir === 'b') {
        // TODO: This should be using timestamp of the current page URL, not the
        // timestamp we're trying to jump from
        const dateOfClosestEvent = new Date(tsForClosestEvent);

        const fromSameDay = areTimestampsFromSameDay(ts, tsForClosestEvent);
        const fromSameHour = areTimestampsFromSameHour(ts, tsForClosestEvent);
        const fromSameMinute = areTimestampsFromSameMinute(ts, tsForClosestEvent);
        const fromSameSecond = areTimestampsFromSameSecond(ts, tsForClosestEvent);

        console.log('fromSameDay', fromSameDay);
        console.log('fromSameHour', fromSameHour);
        console.log('fromSameMinute', fromSameMinute);
        console.log('fromSameSecond', fromSameSecond);

        // The closest event is from the same second we tried to jump from. Since we
        // can't represent something smaller than a second in the URL (we could do MS
        // but it's a concious choice to make the URL cleaner), we will need to just
        // return the timestamp with a precision of seconds and hope that there isn't
        // too many messages in this same second. The `/date/...` router will handle if
        // there is too many messages.
        if (fromSameSecond) {
          newOriginServerTs = tsForClosestEvent;
          preferredPrecision = TIME_PRECISION_VALUES.seconds;
        }
        // The closest event is from the same minute we tried to jump from, we will need
        // to round up to the nearest second so that the URL encompasses the closest
        // event looking backwards
        else if (fromSameMinute) {
          newOriginServerTs = roundUpTimestampToSecond(dateOfClosestEvent);
          preferredPrecision = TIME_PRECISION_VALUES.seconds;
        }
        // The closest event is from the same hour we tried to jump from, we will need
        // to round up to the nearest minute so that the URL encompasses the closest
        // event looking backwards
        else if (fromSameHour) {
          newOriginServerTs = roundUpTimestampToMinute(dateOfClosestEvent);
          preferredPrecision = TIME_PRECISION_VALUES.minutes;
        }
        // The closest event is from the same day we tried to jump from, we will need to
        // round up to the nearest hour so that the URL encompasses the closest event
        // looking backwards
        else if (fromSameDay) {
          newOriginServerTs = roundUpTimestampToHour(dateOfClosestEvent);
          preferredPrecision = TIME_PRECISION_VALUES.minutes;
        }
        // We don't need to do anything. The next closest event is far enough away
        // (greater than 1 day) where we don't need to worry about the URL at all and
        // can just render whatever day that the closest event is from because the
        // archives biggest time-period represented in the URL is a day.
        //
        // We can display more than a day of content at a given URL (imagine lots of a
        // quiet days in a room), but the URL will never represent a time-period
        // greater than a day, ex. `/2023/01/01`. We don't allow someone to just
        // specify the month like `/2023/01` ❌
        else {
          newOriginServerTs = tsForClosestEvent;
        }
      }
      // The goal is to go forward 100 messages, so that when we view the room at that
      // point going backwards 100 messages (which is how the archive works for any
      // given date from the archive URL), we end up at the perfect continuation spot in
      // the room (seamless).
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
        //
        // XXX: It would be cool to somehow cache this response and re-use our work here
        // for the actual room display that we redirect to from this route. No need for
        // us go out 100 messages, only for us to go backwards 100 messages again in the
        // next route.
        const messageResData = await getMessagesResponseFromEventId({
          accessToken: matrixAccessToken,
          roomId,
          eventId: eventIdForClosestEvent,
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
          newOriginServerTs = endOfDayBeforeTs;
          preferredPrecision = TIME_PRECISION_VALUES.minutes;
        }
        // More than a hour gap here, we will need to back-track to the nearest hour
        else if (moreThanHourGap) {
          const utcTopOfHourBefore = Date.UTC(
            dateOfLastMessage.getUTCFullYear(),
            dateOfLastMessage.getUTCMonth(),
            dateOfLastMessage.getUTCDate(),
            dateOfLastMessage.getUTCHours()
          );
          newOriginServerTs = utcTopOfHourBefore;
          preferredPrecision = TIME_PRECISION_VALUES.minutes;
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
          newOriginServerTs = utcTopOfMinuteBefore;
          preferredPrecision = TIME_PRECISION_VALUES.minutes;
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
          newOriginServerTs = utcTopOfSecondBefore;
          preferredPrecision = TIME_PRECISION_VALUES.seconds;
        }
        // Less than a second gap here, we will give up
        else {
          // 501 Not Implemented: the server does not support the functionality required
          // to fulfill the request
          res.status(501);
          res.send(
            `/jump ran into a problem: ${getErrorStringForTooManyMessages(archiveMessageLimit)}`
          );
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
    if (!newOriginServerTs) {
      const tsDate = new Date(ts);
      const yyyy = tsDate.getUTCFullYear();
      const mm = tsDate.getUTCMonth();
      const dd = tsDate.getUTCDate();

      const newDayDelta = dir === 'f' ? 1 : -1;
      newOriginServerTs = Date.UTC(yyyy, mm, dd + newDayDelta);
    }

    // Redirect to a day with messages
    const archiveUrlToRedirecTo = matrixPublicArchiveURLCreator.archiveUrlForDate(
      roomIdOrAlias,
      new Date(newOriginServerTs),
      {
        // Start the scroll at the next event from where they jumped from (seamless navigation)
        scrollStartEventId: eventIdForClosestEvent,
        preferredPrecision,
      }
    );
    console.log(
      '/jump redirecting you to',
      archiveUrlToRedirecTo,
      newOriginServerTs,
      new Date(newOriginServerTs).toISOString(),
      eventIdForClosestEvent
    );
    res.redirect(archiveUrlToRedirecTo);
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
    const highlightEventId = req.query.at;

    const archiveMessageLimit = config.get('archiveMessageLimit');
    assert(archiveMessageLimit);
    // Synapse has a max `/messages` limit of 1000
    assert(
      archiveMessageLimit <= 999,
      'archiveMessageLimit needs to be in range [1, 999]. We can only get 1000 messages at a time from Synapse and we need a buffer of at least one to see if there are too many messages on a given day so you can only configure a max of 999. If you need more messages, we will have to implement pagination'
    );

    const { fromTimestamp, toTimestamp, timeDefined, secondsDefined } =
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
    // redirect to a smaller time range to display.
    if (
      // If there are too many messages, check ...
      events.length >= archiveMessageLimit
    ) {
      let preferredPrecision = null;

      // Check if the first event is from the surroundings or not. Since we're only
      // fetching previous days for the surroundings, we only need to look at the oldest
      // event in the chronological list.
      //
      // XXX: In the future when we also fetch events from days after, we will
      // probably need to change this next day check.
      const isEventFromSurroundingDay = events[0].origin_server_ts < fromTimestamp;

      // If not specifying a time, then let's specify a time. By default the time includes hours and minutes `T23:59`
      if (!timeDefined && !isEventFromSurroundingDay) {
        preferredPrecision = TIME_PRECISION_VALUES.minutes;
      }

      // If we're already specifying minutes in the time but there are too many messages
      // within the minute, let's go to seconds as well
      const isEventFromSurroundingMinute =
        toTimestamp - events[0].origin_server_ts > ONE_MINUTE_IN_MS;
      if (!secondsDefined && !isEventFromSurroundingMinute) {
        preferredPrecision = TIME_PRECISION_VALUES.seconds;
      }

      // If we're already specifying seconds in the time but there are too many messages
      // within the second, let's give up for now ⏩
      const isEventFromSurroundingSecond =
        toTimestamp - events[0].origin_server_ts > ONE_SECOND_IN_MS;
      if (!isEventFromSurroundingSecond) {
        // 501 Not Implemented: the server does not support the functionality required to fulfill the request
        res.status(501);
        res.send(
          `/date ran into a problem: ${getErrorStringForTooManyMessages(archiveMessageLimit)}`
        );
        return;
      }

      if (preferredPrecision) {
        console.log('redirecting preferredPrecision', preferredPrecision, new Date(toTimestamp));
        res.redirect(
          matrixPublicArchiveURLCreator.archiveUrlForDate(roomIdOrAlias, new Date(toTimestamp), {
            preferredPrecision,
            // Pass along the `?at` query parameter
            scrollStartEventId: highlightEventId,
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
