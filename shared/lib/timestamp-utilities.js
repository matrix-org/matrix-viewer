'use strict';

const assert = require('matrix-public-archive-shared/lib/assert');
const { MS_LOOKUP } = require('matrix-public-archive-shared/lib/reference-values');
const { ONE_DAY_IN_MS, ONE_HOUR_IN_MS, ONE_MINUTE_IN_MS, ONE_SECOND_IN_MS } = MS_LOOKUP;

function roundUpTimestampToUtcDay(ts) {
  // A `Date` object will cast just fine to a timestamp integer
  assert(typeof ts === 'number' || ts instanceof Date);
  const dateRountedUp = new Date(Math.ceil(ts / ONE_DAY_IN_MS) * ONE_DAY_IN_MS);
  return dateRountedUp.getTime();
}

function roundUpTimestampToUtcHour(ts) {
  // A `Date` object will cast just fine to a timestamp integer
  assert(typeof ts === 'number' || ts instanceof Date);
  const dateRountedUp = new Date(Math.ceil(ts / ONE_HOUR_IN_MS) * ONE_HOUR_IN_MS);
  return dateRountedUp.getTime();
}

function roundUpTimestampToUtcMinute(ts) {
  // A `Date` object will cast just fine to a timestamp integer
  assert(typeof ts === 'number' || ts instanceof Date);
  const dateRountedUp = new Date(Math.ceil(ts / ONE_MINUTE_IN_MS) * ONE_MINUTE_IN_MS);
  return dateRountedUp.getTime();
}

function roundUpTimestampToUtcSecond(ts) {
  // A `Date` object will cast just fine to a timestamp integer
  assert(typeof ts === 'number' || ts instanceof Date);
  const dateRountedUp = new Date(Math.ceil(ts / ONE_SECOND_IN_MS) * ONE_SECOND_IN_MS);
  return dateRountedUp.getTime();
}

// XXX: Should these just be renamed to `roundDownTimestampToUtcDay`?
function getUtcStartOfDayTs(ts) {
  assert(typeof ts === 'number' || ts instanceof Date);
  const date = new Date(ts);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getUtcStartOfHourTs(ts) {
  assert(typeof ts === 'number' || ts instanceof Date);
  const date = new Date(ts);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
}

function getUtcStartOfMinuteTs(ts) {
  assert(typeof ts === 'number' || ts instanceof Date);
  const date = new Date(ts);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes()
  );
}

function getUtcStartOfSecondTs(ts) {
  assert(typeof ts === 'number' || ts instanceof Date);
  const date = new Date(ts);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  );
}

function areTimestampsFromSameUtcDay(aTs, bTs) {
  return getUtcStartOfDayTs(aTs) === getUtcStartOfDayTs(bTs);
}

function areTimestampsFromSameUtcHour(aTs, bTs) {
  return getUtcStartOfHourTs(aTs) === getUtcStartOfHourTs(bTs);
}

function areTimestampsFromSameUtcMinute(aTs, bTs) {
  return getUtcStartOfMinuteTs(aTs) === getUtcStartOfMinuteTs(bTs);
}

function areTimestampsFromSameUtcSecond(aTs, bTs) {
  return getUtcStartOfSecondTs(aTs) === getUtcStartOfSecondTs(bTs);
}

module.exports = {
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
};
