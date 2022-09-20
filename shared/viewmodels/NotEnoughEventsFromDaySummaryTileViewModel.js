'use strict';

const { SimpleTile } = require('hydrogen-view-sdk');

class NotEnoughEventsFromDaySummaryTileViewModel extends SimpleTile {
  constructor(entry, options) {
    super(entry, options);
  }

  get shape() {
    return 'org.matrix.archive.not_enough_events_from_day_summary:shape';
  }
}

module.exports = NotEnoughEventsFromDaySummaryTileViewModel;
