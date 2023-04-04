'use strict';

const assert = require('matrix-public-archive-shared/lib/assert');
const { MS_LOOKUP } = require('matrix-public-archive-shared/lib/reference-values');
const { ONE_DAY_IN_MS, ONE_HOUR_IN_MS, ONE_MINUTE_IN_MS, ONE_SECOND_IN_MS } = MS_LOOKUP;

// TODO: It would be good to add a few test for these

function roundUpTimestampToDay(ts) {
  assert(typeof ts === 'number');
  const dateRountedUp = new Date(Math.ceil(ts / ONE_DAY_IN_MS) * ONE_DAY_IN_MS);
  return dateRountedUp.getTime();
}

function roundUpTimestampToHour(ts) {
  assert(typeof ts === 'number');
  const dateRountedUp = new Date(Math.ceil(ts / ONE_HOUR_IN_MS) * ONE_HOUR_IN_MS);
  return dateRountedUp.getTime();
}

function roundUpTimestampToMinute(ts) {
  assert(typeof ts === 'number');
  const dateRountedUp = new Date(Math.ceil(ts / ONE_MINUTE_IN_MS) * ONE_MINUTE_IN_MS);
  return dateRountedUp.getTime();
}

function roundUpTimestampToSecond(ts) {
  assert(typeof ts === 'number');
  const dateRountedUp = new Date(Math.ceil(ts / ONE_SECOND_IN_MS) * ONE_SECOND_IN_MS);
  return dateRountedUp.getTime();
}

function areTimestampsFromSameDay(aTs, bTs) {
  return roundUpTimestampToDay(aTs) === roundUpTimestampToDay(bTs);
}

function areTimestampsFromSameHour(aTs, bTs) {
  return roundUpTimestampToHour(aTs) === roundUpTimestampToHour(bTs);
}

function areTimestampsFromSameMinute(aTs, bTs) {
  return roundUpTimestampToMinute(aTs) === roundUpTimestampToMinute(bTs);
}

function areTimestampsFromSameSecond(aTs, bTs) {
  return roundUpTimestampToSecond(aTs) === roundUpTimestampToSecond(bTs);
}

module.exports = {
  roundUpTimestampToDay,
  roundUpTimestampToHour,
  roundUpTimestampToMinute,
  roundUpTimestampToSecond,
  areTimestampsFromSameDay,
  areTimestampsFromSameHour,
  areTimestampsFromSameMinute,
  areTimestampsFromSameSecond,
};
