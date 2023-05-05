'use strict';

const assert = require('assert');
const path = require('path');
const urlJoin = require('url-join');
const express = require('express');
const asyncHandler = require('../lib/express-async-handler');
const StatusError = require('../lib/errors/status-error');

const redirectToCorrectArchiveUrlIfBadSigil = require('../middleware/redirect-to-correct-archive-url-if-bad-sigil-middleware');
const identifyRoute = require('../middleware/identify-route-middleware');

const { HTTPResponseError } = require('../lib/fetch-endpoint');
const parseViaServersFromUserInput = require('../lib/parse-via-servers-from-user-input');
const {
  fetchRoomData,
  fetchPredecessorInfo,
  fetchSuccessorInfo,
} = require('../lib/matrix-utils/fetch-room-data');
const fetchEventsFromTimestampBackwards = require('../lib/matrix-utils/fetch-events-from-timestamp-backwards');
const ensureRoomJoined = require('../lib/matrix-utils/ensure-room-joined');
const timestampToEvent = require('../lib/matrix-utils/timestamp-to-event');
const { removeMe_fetchRoomCreateEventId } = require('../lib/matrix-utils/fetch-room-data');
const getMessagesResponseFromEventId = require('../lib/matrix-utils/get-messages-response-from-event-id');
const renderHydrogenVmRenderScriptToPageHtml = require('../hydrogen-render/render-hydrogen-vm-render-script-to-page-html');
const setHeadersToPreloadAssets = require('../lib/set-headers-to-preload-assets');
const setHeadersForDateTemporalContext = require('../lib/set-headers-for-date-temporal-context');
const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');
const checkTextForNsfw = require('matrix-public-archive-shared/lib/check-text-for-nsfw');
const {
  MS_LOOKUP,
  TIME_PRECISION_VALUES,
  DIRECTION,
  VALID_ENTITY_DESCRIPTOR_TO_SIGIL_MAP,
} = require('matrix-public-archive-shared/lib/reference-values');
const { ONE_DAY_IN_MS, ONE_HOUR_IN_MS, ONE_MINUTE_IN_MS, ONE_SECOND_IN_MS } = MS_LOOKUP;
const {
  roundUpTimestampToUtcDay,
  roundUpTimestampToUtcHour,
  roundUpTimestampToUtcMinute,
  roundUpTimestampToUtcSecond,
  getUtcStartOfDayTs,
  getUtcStartOfHourTs,
  getUtcStartOfMinuteTs,
  getUtcStartOfSecondTs,
  areTimestampsFromSameUtcDay,
  areTimestampsFromSameUtcHour,
  areTimestampsFromSameUtcMinute,
  areTimestampsFromSameUtcSecond,
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

  let toTimestamp;
  if (timeInMs) {
    const startOfDayTimestamp = Date.UTC(yyyy, mm, dd);
    toTimestamp = startOfDayTimestamp + timeInMs;
  }
  // If no time specified, then we assume end-of-day
  else {
    // We `- 1` from UTC midnight to get the timestamp that is a millisecond before the
    // next day T23:59:59.999
    toTimestamp = Date.UTC(yyyy, mm, dd + 1) - 1;
  }

  return {
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
  identifyRoute('app-archive-room-index'),
  asyncHandler(async function (req, res) {
    const roomIdOrAlias = getRoomIdOrAliasFromReq(req);

    // In case we're joining a new room for the first time,
    // let's avoid redirecting to our join event by getting
    // the time before we join and looking backwards.
    const dateBeforeJoin = Date.now();

    // We have to wait for the room join to happen first before we can fetch
    // any of the additional room info or messages.
    const roomId = await ensureRoomJoined(matrixAccessToken, roomIdOrAlias, {
      viaServers: parseViaServersFromUserInput(req.query.via),
      abortSignal: req.abortSignal,
    });

    // Find the closest day to the current time with messages
    const { originServerTs } = await timestampToEvent({
      accessToken: matrixAccessToken,
      roomId,
      ts: dateBeforeJoin,
      direction: DIRECTION.backward,
      abortSignal: req.abortSignal,
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
        //viaServers: parseViaServersFromUserInput(req.query.via),
      })
    );
  })
);

router.get(
  '/event/:eventId',
  identifyRoute('app-archive-room-event'),
  asyncHandler(async function (req, res) {
    // TODO: Fetch event to get `origin_server_ts` and redirect to
    // /!roomId/2022/01/01?at=$eventId
    res.send('todo');
  })
);

router.get(
  '/jump',
  identifyRoute('app-archive-room-jump'),
  // eslint-disable-next-line max-statements, complexity
  asyncHandler(async function (req, res) {
    const roomIdOrAlias = getRoomIdOrAliasFromReq(req);

    const currentRangeStartTs = parseInt(req.query.currentRangeStartTs, 10);
    assert(
      !Number.isNaN(currentRangeStartTs),
      '?currentRangeStartTs query parameter must be a number'
    );
    const currentRangeEndTs = parseInt(req.query.currentRangeEndTs, 10);
    assert(!Number.isNaN(currentRangeEndTs), '?currentRangeEndTs query parameter must be a number');
    const dir = req.query.dir;
    assert(
      [DIRECTION.forward, DIRECTION.backward].includes(dir),
      '?dir query parameter must be [f|b]'
    );

    const timelineStartEventId = req.query.timelineStartEventId;
    assert(
      ['string', 'undefined'].includes(typeof timelineStartEventId),
      `?timelineStartEventId must be a string or undefined but saw ${typeof timelineStartEventId}`
    );
    const timelineEndEventId = req.query.timelineEndEventId;
    assert(
      ['string', 'undefined'].includes(typeof timelineStartEventId),
      `?timelineEndEventId must be a string or undefined but saw ${typeof timelineStartEventId}`
    );

    // We have to wait for the room join to happen first before we can use the jump to
    // date endpoint (or any other Matrix endpoint)
    const viaServers = parseViaServersFromUserInput(req.query.via);
    const roomId = await ensureRoomJoined(matrixAccessToken, roomIdOrAlias, {
      viaServers,
      abortSignal: req.abortSignal,
    });

    let ts;
    let fromCausalEventId;
    if (dir === DIRECTION.backward) {
      // We `- 1` so we don't jump to the same event because the endpoint is inclusive.
      //
      // XXX: This is probably an edge-case flaw when there could be multiple events at
      // the same timestamp
      //
      // TODO: Remove the `- 1` when we have the MSC3999 causal event ID support
      ts = currentRangeStartTs - 1;
      fromCausalEventId = timelineStartEventId;
    } else if (dir === DIRECTION.forward) {
      // We `+ 1` so we don't jump to the same event because the endpoint is inclusive
      //
      // XXX: This is probably an edge-case flaw when there could be multiple events at
      // the same timestamp
      //
      // TODO: Remove the `+ 1` when we have the MSC3999 causal event ID support
      ts = currentRangeEndTs + 1;
      fromCausalEventId = timelineEndEventId;
    } else {
      throw new StatusError(400, `Unable to handle unknown dir=${dir} in /jump`);
    }

    let eventIdForClosestEvent;
    let tsForClosestEvent;
    let newOriginServerTs;
    let preferredPrecision = null;
    try {
      // We pull this fresh from the config for each request to ensure we have an
      // updated value between each e2e test
      const archiveMessageLimit = config.get('archiveMessageLimit');

      let roomCreateEventId;
      // Find the closest event to the given timestamp
      [{ eventId: eventIdForClosestEvent, originServerTs: tsForClosestEvent }, roomCreateEventId] =
        await Promise.all([
          timestampToEvent({
            accessToken: matrixAccessToken,
            roomId,
            ts: ts,
            direction: dir,
            // Since timestamps are untrusted and can be crafted to make loops in the
            // timeline. We use this as a signal to keep progressing from this event
            // regardless of what timestamp shenanigans are going on. See MSC3999
            // (https://github.com/matrix-org/matrix-spec-proposals/pull/3999)
            //
            // TODO: Add tests for timestamp loops once Synapse supports MSC3999. We
            // currently just have this set in case some server has this implemented in
            // the future but there currently is no implementation (as of 2023-04-17) and
            // we can't have passing tests without a server implementation first.
            //
            // TODO: This isn't implemented yet
            fromCausalEventId,
            abortSignal: req.abortSignal,
          }),
          removeMe_fetchRoomCreateEventId(matrixAccessToken, roomId, {
            abortSignal: req.abortSignal,
          }),
        ]);

      // Without MSC3999, we currently only detect one kind of loop where the
      // `m.room.create` has a timestamp that comes after the timestamp massaged events
      // in the room. This is a common pattern for historical Gitter rooms where we
      // created the room and then imported a bunch of messages at a time before the
      // room was created.
      //
      // By nature of having an `timelineEndEventId`, we know we are already paginated
      // past the `m.room.create` event which is always the first event in the room. So
      // we can use that to detect the end of the room before we loop back around to the
      // start of the room.
      //
      // XXX: Once we have MSC3999, we can remove this check in favor of that mechanism
      if (
        dir === DIRECTION.forward &&
        timelineEndEventId &&
        eventIdForClosestEvent === roomCreateEventId
      ) {
        throw new StatusError(
          404,
          `/jump?dir=${dir}: We detected a loop back to the beginning of the room so we can assume ` +
            `we hit the end of the room instead of doing a loop. We throw a 404 error here we hit ` +
            `the normal 404 no more /messages error handling below`
        );
      }

      // Based on what we found was the closest, figure out the URL that will represent
      // the next chunk in the desired direction.
      // ==============================
      //
      // When jumping backwards, since a given room archive URL represents the end of
      // the day/time-period looking backward (scroll is also anchored to the bottom),
      // we just need to move the user to the time-period just prior the current one.
      //
      // We are trying to avoid sending the user to the same time period they were just
      // viewing. i.e, if they were visiting `/2020/01/02T16:00:00` (displays messages
      // backwards from that time up to the limit), which had more messages than we
      // could display in that day, jumping backwards from the earliest displayed event
      // in the displayed range (say that occured on `T12:00:25`) would still give us
      // the same day `/2020/01/02` and we want to redirect them to previous chunk from
      // that same day that still encompasses the closest message looking backwards,
      // like `/2020/01/02T13:00:00`
      if (dir === DIRECTION.backward) {
        // We choose `currentRangeStartTs` instead of `ts` (the jump point) because
        // TODO: why? and we don't choose `currentRangeEndTs` because TODO: why? - I
        // feel like I can't justify this, see
        // https://github.com/matrix-org/matrix-public-archive/pull/167#discussion_r1170850432
        const fromSameDay =
          tsForClosestEvent && areTimestampsFromSameUtcDay(currentRangeStartTs, tsForClosestEvent);
        const fromSameHour =
          tsForClosestEvent && areTimestampsFromSameUtcHour(currentRangeStartTs, tsForClosestEvent);
        const fromSameMinute =
          tsForClosestEvent &&
          areTimestampsFromSameUtcMinute(currentRangeStartTs, tsForClosestEvent);
        const fromSameSecond =
          tsForClosestEvent &&
          areTimestampsFromSameUtcSecond(currentRangeStartTs, tsForClosestEvent);

        // The closest event is from the same second we tried to jump from. Since we
        // can't represent something smaller than a second in the URL yet (we could do
        // ms but it's a concious choice to make the URL cleaner,
        // #support-ms-time-slice), we will need to just return the timestamp with a
        // precision of seconds and hope that there isn't too many messages in this same
        // second.
        //
        // XXX: If there is too many messages all within the same second, people will be
        // stuck visiting the same page over and over every time they try to jump
        // backwards from that range.
        if (fromSameSecond) {
          newOriginServerTs = tsForClosestEvent;
          preferredPrecision = TIME_PRECISION_VALUES.seconds;
        }
        // The closest event is from the same minute we tried to jump from, we will need
        // to round up to the nearest second so that the URL encompasses the closest
        // event looking backwards
        else if (fromSameMinute) {
          newOriginServerTs = roundUpTimestampToUtcSecond(tsForClosestEvent);
          preferredPrecision = TIME_PRECISION_VALUES.seconds;
        }
        // The closest event is from the same hour we tried to jump from, we will need
        // to round up to the nearest minute so that the URL encompasses the closest
        // event looking backwards
        else if (fromSameHour) {
          newOriginServerTs = roundUpTimestampToUtcMinute(tsForClosestEvent);
          preferredPrecision = TIME_PRECISION_VALUES.minutes;
        }
        // The closest event is from the same day we tried to jump from, we will need to
        // round up to the nearest hour so that the URL encompasses the closest event
        // looking backwards
        else if (fromSameDay) {
          newOriginServerTs = roundUpTimestampToUtcHour(tsForClosestEvent);
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
      // When jumping forwards, the goal is to go forward 100 messages, so that when we
      // view the room at that point going backwards 100 messages (which is how the
      // archive works for any given date from the archive URL), we end up at the
      // perfect continuation spot in the room (seamless).
      //
      // XXX: This is flawed in the fact that when we go `/messages?dir=b` later, it
      // could backfill messages which will fill up the response before we perfectly
      // connect and continue from the position they were jumping from before. When
      // `/messages?dir=f` backfills (forwards fill), we won't have this problem anymore
      // because any messages backfilled in the forwards direction would be picked up
      // the same going backwards. See MSC4000
      // (https://github.com/matrix-org/matrix-spec-proposals/pull/4000).
      else if (dir === DIRECTION.forward) {
        // XXX: It would be cool to somehow cache this response and re-use our work here
        // for the actual room display that we redirect to from this route. No need for
        // us go out 100 messages, only for us to go backwards 100 messages again in the
        // next route.
        const messageResData = await getMessagesResponseFromEventId({
          accessToken: matrixAccessToken,
          roomId,
          eventId: eventIdForClosestEvent,
          dir: DIRECTION.forward,
          limit: archiveMessageLimit,
          abortSignal: req.abortSignal,
        });

        if (!messageResData.chunk?.length) {
          throw new StatusError(
            404,
            `/jump?dir=${dir}: /messages response didn't contain any more messages to jump to so we can assume we reached the end of the room.`
          );
        }

        const firstMessage = messageResData.chunk[0];
        const tsOfFirstMessage = firstMessage.origin_server_ts;

        const lastMessage = messageResData.chunk[messageResData.chunk.length - 1];
        const tsOfLastMessage = lastMessage.origin_server_ts;

        let msGapFromJumpPointToLastMessage;
        // If someone is jumping from `0`, let's assume this is their first time
        // navigating in the room and are just trying to get to the first messages in
        // the room. Instead of using `0` which give us `moreThanDayGap=true` every time
        // (unless someone sent messages in 1970 :P), and round us down to the nearest
        // day before any of the messages in the room start, let's just use the start of
        // the timeline as the start which will show us a page of content on the first
        // try. For the backwards direction, we could have a similar check but with
        // `currentRangeStartTs === Infinity` check but it's not necessary since we
        // don't have to do any back-tracking extra work.
        if (currentRangeEndTs === 0) {
          msGapFromJumpPointToLastMessage = tsOfLastMessage - tsOfFirstMessage;
        }
        // Otherwise do the normal calculation: where we jumped to - where we jumped from
        else {
          // TODO: Should we use `ts` or `currentRangeStartTs` here?
          msGapFromJumpPointToLastMessage = tsOfLastMessage - ts;
        }
        const moreThanDayGap = msGapFromJumpPointToLastMessage > ONE_DAY_IN_MS;
        const moreThanHourGap = msGapFromJumpPointToLastMessage > ONE_HOUR_IN_MS;
        const moreThanMinuteGap = msGapFromJumpPointToLastMessage > ONE_MINUTE_IN_MS;
        const moreThanSecondGap = msGapFromJumpPointToLastMessage > ONE_SECOND_IN_MS;

        // If the first message is on different day than the last message, then we know
        // there are messages on days before the last mesage and can safely round to the
        // nearest day and still see new content.
        //
        // We use this information to handle situations where we jump over multiple-day
        // gaps with no messages in between. In those cases, we don't want to round down
        // to a day where there are no messages in the gap.
        const hasMessagesOnDayBeforeDayOfLastMessage = !areTimestampsFromSameUtcDay(
          tsOfFirstMessage,
          tsOfLastMessage
        );

        // Back-track from the last message timestamp to the nearest date boundary.
        // Because we're back-tracking a couple events here, when we paginate back out
        // by the `archiveMessageLimit` later in the room route, it will gurantee some
        // overlap with the previous page we jumped from so we don't lose any messages
        // in the gap.
        //
        // We could choose to jump to the exact timestamp of the last message instead of
        // back-tracking but then we get ugly URL's every time you jump instead of being
        // able to back-track and round down to the nearest hour in a lot of cases. The
        // other reason not to return the exact date is maybe there multiple messages at
        // the same timestamp and we will lose messages in the gap because it displays
        // more than we thought.
        //
        // If the `/messages` response returns less than the `archiveMessageLimit`
        // looking forwards, it means we're looking at the latest events in the room. We
        // can simply just display the day that the latest event occured on or the given
        // rangeEnd (whichever is later).
        const haveReachedLatestMessagesInRoom = messageResData.chunk?.length < archiveMessageLimit;
        if (haveReachedLatestMessagesInRoom) {
          const latestDesiredTs = Math.max(currentRangeEndTs, tsOfLastMessage);
          const latestDesiredDate = new Date(latestDesiredTs);
          const utcMidnightTs = getUtcStartOfDayTs(latestDesiredDate);
          newOriginServerTs = utcMidnightTs;
          preferredPrecision = TIME_PRECISION_VALUES.none;
        }
        // More than a day gap here, so we can just back-track to the nearest day as
        // long as there are messages we haven't seen yet if we visit the nearest day.
        else if (moreThanDayGap && hasMessagesOnDayBeforeDayOfLastMessage) {
          const utcMidnightOfDayBefore = getUtcStartOfDayTs(tsOfLastMessage);
          // We `- 1` from UTC midnight to get the timestamp that is a millisecond
          // before the next day but we choose a no time precision so we jump to just
          // the bare date without a time. A bare date in the `/date/2022/12/16`
          // endpoint represents the end of that day looking backwards so this is
          // exactly what we want.
          const endOfDayBeforeTs = utcMidnightOfDayBefore - 1;
          newOriginServerTs = endOfDayBeforeTs;
          preferredPrecision = TIME_PRECISION_VALUES.none;
        }
        // More than a hour gap here, we will need to back-track to the nearest hour
        else if (moreThanHourGap) {
          const utcTopOfHourBefore = getUtcStartOfHourTs(tsOfLastMessage);
          newOriginServerTs = utcTopOfHourBefore;
          preferredPrecision = TIME_PRECISION_VALUES.minutes;
        }
        // More than a minute gap here, we will need to back-track to the nearest minute
        else if (moreThanMinuteGap) {
          const utcTopOfMinuteBefore = getUtcStartOfMinuteTs(tsOfLastMessage);
          newOriginServerTs = utcTopOfMinuteBefore;
          preferredPrecision = TIME_PRECISION_VALUES.minutes;
        }
        // More than a second gap here, we will need to back-track to the nearest second
        else if (moreThanSecondGap) {
          const utcTopOfSecondBefore = getUtcStartOfSecondTs(tsOfLastMessage);
          newOriginServerTs = utcTopOfSecondBefore;
          preferredPrecision = TIME_PRECISION_VALUES.seconds;
        }
        // Less than a second gap here, we will give up.
        //
        // XXX: Maybe we can support ms here (#support-ms-time-slice)
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
      const is404HTTPResponseError =
        err instanceof HTTPResponseError && err.response.status === 404;
      const is404StatusError = err instanceof StatusError && err.status === 404;
      const is404Error = is404HTTPResponseError || is404StatusError;
      // A 404 error just means there is no more messages to paginate in that room and
      // we should try to go to the predecessor/successor room appropriately.
      if (is404Error) {
        if (dir === DIRECTION.backward) {
          const {
            currentRoomCreationTs,
            predecessorRoomId,
            predecessorLastKnownEventId,
            predecessorViaServers,
          } = await fetchPredecessorInfo(matrixAccessToken, roomId, {
            abortSignal: req.abortSignal,
          });

          if (!predecessorRoomId) {
            throw new StatusError(
              404,
              `No predecessor room found for ${roomId} so we can't jump backwards to anywhere (you already reached the end of the room)`
            );
          }

          // We have to join the predecessor room before we can fetch the successor info
          // (this could be our first time seeing the room)
          await ensureRoomJoined(matrixAccessToken, predecessorRoomId, {
            viaServers,
            abortSignal: req.abortSignal,
          });
          const {
            successorRoomId: successorRoomIdForPredecessor,
            successorSetTs: successorSetTsForPredecessor,
          } = await fetchSuccessorInfo(matrixAccessToken, predecessorRoomId, {
            abortSignal: req.abortSignal,
          });

          let tombstoneEventId;
          if (!predecessorLastKnownEventId) {
            // This is a hack because we can't get the tombstone event ID directly from
            // `fetchSuccessorInfo(...)` and the `/state?format=event`
            // endpoint, so we have to do this trick. Related to
            // https://github.com/matrix-org/synapse/issues/15454
            //
            // We just assume this is the tombstone event ID but in any case it gets us to
            // an event that happened at the same time.
            ({ eventId: tombstoneEventId } = await timestampToEvent({
              accessToken: matrixAccessToken,
              roomId: predecessorRoomId,
              ts: successorSetTsForPredecessor,
              direction: DIRECTION.backward,
              abortSignal: req.abortSignal,
            }));
          }

          // Try to continue from the tombstone event in the predecessor room because
          // that is the signal that the room admins gave to indicate the end of the
          // room in favor of the other regardless of further activity that may have
          // occured in the room.
          //
          // Make sure the the room that the predecessor specifies as the replacement
          // room is the same as what the current room is. This is a good signal that
          // the rooms are a true continuation of each other and the room admins agree.
          let continueAtTsInPredecessorRoom;
          if (successorRoomIdForPredecessor === roomId) {
            continueAtTsInPredecessorRoom = successorSetTsForPredecessor;
          }
          // Fallback to the room creation event time if we can't find the predecessor
          // room tombstone which will work just fine and as expected for normal room
          // upgrade scenarios.
          else {
            continueAtTsInPredecessorRoom = currentRoomCreationTs;
          }

          if (
            continueAtTsInPredecessorRoom === null ||
            continueAtTsInPredecessorRoom === undefined
          ) {
            throw new StatusError(
              500,
              `You navigated past the end of the room and it has a predecessor set (${predecessorRoomId}) ` +
                `but we were unable to find a suitable place to jump to and continue from. ` +
                `We could just redirect you to that predecessor room but we decided to throw an error ` +
                `instead because we should be able to fallback to the room creation time in any case. ` +
                `In other words, there shouldn't be a reason why we can't fetch the \`m.room.create\`` +
                `event for this room unless the server is just broken right now. You can try refreshing to try again.`
            );
          }

          // Jump to the predecessor room at the appropriate timestamp to continue from.
          // Since we're going backwards, we already know where to go so we can navigate
          // straight there.
          res.redirect(
            matrixPublicArchiveURLCreator.archiveUrlForDate(
              predecessorRoomId,
              // XXX: We should probably go fetch and use the timestamp from
              // `predecessorLastKnownEventId` here but that requires an extra
              // `timestampToEvent(...)` lookup. We can assume it's close to the
              // tombstone for now.
              new Date(continueAtTsInPredecessorRoom),
              {
                viaServers: Array.from(predecessorViaServers || []),
                scrollStartEventId: predecessorLastKnownEventId || tombstoneEventId,
                // We can just visit a rough time where the tombstone is as we assume
                // it's the last event in the room or at least the last event we care
                // about. A given day should be good for most cases but it's possible
                // that messages are sent after the tombstone and we end up missing the
                // tombstone.
                preferredPrecision: TIME_PRECISION_VALUES.none,
              }
            )
          );
          return;
        } else if (dir === DIRECTION.forward) {
          const { successorRoomId } = await fetchSuccessorInfo(matrixAccessToken, roomId, {
            abortSignal: req.abortSignal,
          });
          if (successorRoomId) {
            // Jump to the successor room and continue at the first event of the room
            res.redirect(
              matrixPublicArchiveURLCreator.archiveJumpUrlForRoom(successorRoomId, {
                dir: DIRECTION.forward,
                currentRangeStartTs: 0,
                currentRangeEndTs: 0,
                // We don't need to define
                // `currentRangeStartEventId`/`currentRangeEndEventId` here because we're
                // jumping to a completely new room so the event IDs won't pertain to the
                // new room and we don't have any to use anyway.
              })
            );
            return;
          }
        }
      }
      // Only throw if it's something other than a 404 error. 404 errors are fine, they
      // just mean there is no more messages to paginate in that room and we were
      // already viewing the latest in the room.
      else {
        throw err;
      }
    }

    // If we can't find any more messages to paginate to, just progress the date by a
    // day in whatever direction they wanted to go so we can display the empty view for
    // that day.
    if (!newOriginServerTs) {
      let tsAtRangeBoundaryInDirection;
      if (dir === DIRECTION.backward) {
        tsAtRangeBoundaryInDirection = currentRangeStartTs;
      } else if (dir === DIRECTION.forward) {
        tsAtRangeBoundaryInDirection = currentRangeEndTs;
      }

      const dateAtRangeBoundaryInDirection = new Date(tsAtRangeBoundaryInDirection);
      const yyyy = dateAtRangeBoundaryInDirection.getUTCFullYear();
      const mm = dateAtRangeBoundaryInDirection.getUTCMonth();
      const dd = dateAtRangeBoundaryInDirection.getUTCDate();

      const newDayDelta = dir === DIRECTION.forward ? 1 : -1;
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
    res.redirect(archiveUrlToRedirecTo);
  })
);

// Shows messages from the given date/time looking backwards up to the limit.
router.get(
  // The extra set of parenthesis around `((:\\d\\d?)?)` is to work around a
  // `path-to-regex` bug where the `?` wasn't attaching to the capture group, see
  // https://github.com/pillarjs/path-to-regexp/issues/287
  '/date/:yyyy(\\d{4})/:mm(\\d{2})/:dd(\\d{2}):time(T\\d\\d?:\\d\\d?((:\\d\\d?)?))?',
  identifyRoute('app-archive-room-date'),
  // eslint-disable-next-line max-statements, complexity
  asyncHandler(async function (req, res) {
    const nowTs = Date.now();
    const roomIdOrAlias = getRoomIdOrAliasFromReq(req);

    // We pull this fresh from the config for each request to ensure we have an
    // updated value between each e2e test
    const archiveMessageLimit = config.get('archiveMessageLimit');
    assert(archiveMessageLimit);
    // Synapse has a max `/messages` limit of 1000
    assert(
      archiveMessageLimit <= 999,
      'archiveMessageLimit needs to be in range [1, 999]. We can only get 1000 messages at a time from Synapse and we need a buffer of at least one to see if there are too many messages on a given day so you can only configure a max of 999. If you need more messages, we will have to implement pagination'
    );

    const { toTimestamp, yyyy, mm, dd, timeDefined, secondsDefined } =
      parseArchiveRangeFromReq(req);

    let precisionFromUrl = TIME_PRECISION_VALUES.none;
    if (secondsDefined) {
      precisionFromUrl = TIME_PRECISION_VALUES.seconds;
    } else if (timeDefined) {
      precisionFromUrl = TIME_PRECISION_VALUES.minutes;
    }

    // Just 404 if anyone is trying to view the future, no need to waste resources on
    // that
    if (toTimestamp > roundUpTimestampToUtcDay(nowTs)) {
      throw new StatusError(
        404,
        `You can't view the history of a room on a future day (${new Date(
          toTimestamp
        ).toISOString()} > ${new Date(nowTs).toISOString()}). Go back`
      );
    }

    // We have to wait for the room join to happen first before we can fetch
    // any of the additional room info or messages.
    //
    // XXX: It would be better if we just tried fetching first and assume that we are
    // already joined and only join after we see a 403 Forbidden error (we should do
    // this for all places we `ensureRoomJoined`). But we need the `roomId` for use with
    // the various Matrix API's anyway and `/join/{roomIdOrAlias}` -> `{ room_id }` is a
    // great way to get it (see
    // https://github.com/matrix-org/matrix-public-archive/issues/50).
    const viaServers = parseViaServersFromUserInput(req.query.via);
    const roomId = await ensureRoomJoined(matrixAccessToken, roomIdOrAlias, {
      viaServers,
      abortSignal: req.abortSignal,
    });

    // Do these in parallel to avoid the extra time in sequential round-trips
    // (we want to display the archive page faster)
    const [roomData, { events, stateEventMap }] = await Promise.all([
      fetchRoomData(matrixAccessToken, roomId, { abortSignal: req.abortSignal }),
      // We over-fetch messages outside of the range of the given day so that we
      // can display messages from surrounding days (currently only from days
      // before) so that the quiet rooms don't feel as desolate and broken.
      //
      // When given a bare date like `2022/11/16`, we want to paginate from the end of that
      // day backwards. This is why we use the `toTimestamp` here and fetch backwards.
      fetchEventsFromTimestampBackwards({
        accessToken: matrixAccessToken,
        roomId,
        ts: toTimestamp,
        // We fetch one more than the `archiveMessageLimit` so that we can see if there
        // are too many messages from the given day. If we have over the
        // `archiveMessageLimit` number of messages fetching from the given day, it's
        // acceptable to have them be from surrounding days. But if all 500 messages
        // (for example) are from the same day, let's redirect to a smaller hour range
        // to display.
        limit: archiveMessageLimit + 1,
        abortSignal: req.abortSignal,
      }),
    ]);

    // Only `world_readable` or `shared` rooms that are `public` are viewable in the archive
    const allowedToViewRoom =
      roomData.historyVisibility === 'world_readable' ||
      (roomData.historyVisibility === 'shared' && roomData.joinRule === 'public');

    if (!allowedToViewRoom) {
      throw new StatusError(
        403,
        `Only \`world_readable\` or \`shared\` rooms that are \`public\` can be viewed in the archive. ${roomData.id} has m.room.history_visiblity=${roomData.historyVisibility} m.room.join_rules=${roomData.joinRule}`
      );
    }

    // Since we're looking backwards from the given day, if we don't see any events,
    // then we can assume that it's before the start of the room (it's the only way we
    // would see no events).
    const hasNavigatedBeforeStartOfRoom = events.length === 0;
    // Check if we need to navigate backward to the predecessor room
    if (hasNavigatedBeforeStartOfRoom && roomData.predecessorRoomId) {
      // Jump to the predecessor room at the date/time the user is trying to visit at
      res.redirect(
        matrixPublicArchiveURLCreator.archiveUrlForDate(
          roomData.predecessorRoomId,
          new Date(toTimestamp),
          {
            preferredPrecision: precisionFromUrl,
            // XXX: Should we also try combining `viaServers` we used to get to this room?
            viaServers: Array.from(roomData.predecessorViaServers || []),
          }
        )
      );
      return;
    }

    // We only care to navigate to the successor room if we're trying to view something
    // past when the successor was set (it's an indicator that we need to go to the new
    // room from this time forward).
    const isNavigatedPastSuccessor = toTimestamp > roomData.successorSetTs;
    // But if we're viewing the day when the successor was set, we want to allow viewing
    // the room up until the successor was set.
    const newestEvent = events[events.length - 1];
    const isNewestEventFromSameDay =
      newestEvent &&
      newestEvent?.origin_server_ts &&
      areTimestampsFromSameUtcDay(toTimestamp, newestEvent?.origin_server_ts);
    // Check if we need to navigate forward to the successor room
    if (roomData.successorRoomId && isNavigatedPastSuccessor && !isNewestEventFromSameDay) {
      // Jump to the successor room at the date/time the user is trying to visit at
      res.redirect(
        matrixPublicArchiveURLCreator.archiveUrlForDate(
          roomData.successorRoomId,
          new Date(toTimestamp),
          {
            preferredPrecision: precisionFromUrl,
            // Just try to pass on the `viaServers` the user was using to get to this room
            viaServers: Array.from(viaServers || []),
          }
        )
      );
      return;
    }

    // Default to no indexing (safe default)
    let shouldIndex = false;
    if (stopSearchEngineIndexing) {
      shouldIndex = false;
    } else {
      // Otherwise we only allow search engines to index `world_readable` rooms
      shouldIndex = roomData?.historyVisibility === `world_readable`;
    }

    const isNsfw = checkTextForNsfw(
      // We concat the name, topic, etc together to simply do a single check against
      // all of the text.
      `${roomData.name} --- ${roomData.canonicalAlias} --- ${roomData.topic} `
    );

    const pageOptions = {
      title: `${roomData.name} - Matrix Public Archive`,
      description: `View the history of ${roomData.name} in the Matrix Public Archive`,
      blockedBySafeSearch: isNsfw,
      entryPoint: 'client/js/entry-client-hydrogen.js',
      locationHref: urlJoin(basePath, req.originalUrl),
      shouldIndex,
      cspNonce: res.locals.cspNonce,
    };
    const pageHtml = await renderHydrogenVmRenderScriptToPageHtml({
      pageOptions,
      vmRenderScriptFilePath: path.resolve(__dirname, '../../shared/hydrogen-vm-render-script.js'),
      vmRenderContext: {
        toTimestamp,
        precisionFromUrl,
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
          basePath,
          matrixServerUrl,
          archiveMessageLimit,
        },
      },
      abortSignal: req.abortSignal,
    });

    setHeadersToPreloadAssets(res, pageOptions);

    // This is useful for caching purposes so you can heavily cache past content, but
    // not present/future.
    setHeadersForDateTemporalContext({
      res,
      nowTs,
      comparedToUrlDate: {
        yyyy,
        mm,
        dd,
      },
    });

    res.set('Content-Type', 'text/html');
    res.send(pageHtml);
  })
);

module.exports = router;
