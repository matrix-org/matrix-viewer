'use strict';

const { SimpleTile } = require('hydrogen-view-sdk');

const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');
const assert = require('../lib/assert');

class NotEnoughEventsFromDaySummaryTileViewModel extends SimpleTile {
  constructor(entry, options) {
    super(entry, options);
    this._entry = entry;

    const basePath = this._entry?.content?.['basePath'];
    assert(basePath);
    this._matrixPublicArchiveURLCreator = new MatrixPublicArchiveURLCreator(basePath);
  }

  get shape() {
    return 'org.matrix.archive.not_enough_events_from_day_summary:shape';
  }

  get daySummaryKind() {
    return this._entry?.content?.['daySummaryKind'];
  }

  get dayTimestamp() {
    return this._entry?.content?.['dayTimestamp'];
  }

  // The end of the range to use as a jumping off point to the next activity
  get rangeEndTimestamp() {
    return this._entry?.content?.['rangeEndTimestamp'];
  }

  get jumpToNextActivityUrl() {
    return this._matrixPublicArchiveURLCreator.archiveJumpUrlForRoom(
      this._entry?.content?.['canonicalAlias'] || this._entry.roomId,
      {
        ts: this.rangeEndTimestamp,
        dir: 'f',
      }
    );
  }
}

module.exports = NotEnoughEventsFromDaySummaryTileViewModel;
