'use strict';

const assert = require('assert');

const { getUtcStartOfDayTs } = require('matrix-viewer-shared/lib/timestamp-utilities');

// `X-Date-Temporal-Context` indicates the temporal context of the content, whether it
// is related to past, present, or future *day*.
//
// This is useful for caching purposes so you can heavily cache past content, but not
// present/future.
function setHeadersForDateTemporalContext({ res, nowTs, comparedToUrlDate: { yyyy, mm, dd } }) {
  assert(res);
  assert(Number.isInteger(nowTs));
  assert(Number.isInteger(yyyy));
  assert(Number.isInteger(mm));
  assert(Number.isInteger(dd));

  // We use the start of the UTC day so we can compare apples to apples with a new date
  // constructed with yyyy-mm-dd (no time occured since the start of the day)
  const startOfTodayTs = getUtcStartOfDayTs(nowTs);
  const compareTs = Date.UTC(yyyy, mm, dd);

  let temporalContext = 'present';
  if (compareTs < startOfTodayTs) {
    temporalContext = 'past';
  } else if (compareTs > startOfTodayTs) {
    temporalContext = 'future';
  }

  res.set('X-Date-Temporal-Context', temporalContext);
}

module.exports = setHeadersForDateTemporalContext;
