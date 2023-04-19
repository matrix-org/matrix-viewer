'use strict';

const { SimpleTile } = require('hydrogen-view-sdk');

const { DIRECTION } = require('matrix-public-archive-shared/lib/reference-values');
const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');
const assert = require('../lib/assert');

class JumpToNextActivitySummaryTileViewModel extends SimpleTile {
  constructor(entry, options) {
    super(entry, options);
    this._entry = entry;

    const basePath = this._entry?.content?.['basePath'];
    assert(basePath);
    this._matrixPublicArchiveURLCreator = new MatrixPublicArchiveURLCreator(basePath);
  }

  get shape() {
    return 'org.matrix.archive.jump_to_next_activity_summary:shape';
  }

  get daySummaryKind() {
    return this._entry?.content?.['daySummaryKind'];
  }

  get dayTimestamp() {
    return this._entry?.content?.['dayTimestamp'];
  }

  // The start of the range to use as a jumping off point to the previous activity
  get jumpRangeStartTimestamp() {
    return this._entry?.content?.['jumpRangeStartTimestamp'];
  }

  // The end of the range to use as a jumping off point to the next activity
  get jumpRangeEndTimestamp() {
    return this._entry?.content?.['jumpRangeEndTimestamp'];
  }

  // The first event shown in the timeline.
  get timelineStartEventId() {
    return this._entry?.content?.['timelineStartEventId'];
  }

  // The last event shown in the timeline.
  get timelineEndEventId() {
    return this._entry?.content?.['timelineEndEventId'];
  }

  get jumpToNextActivityUrl() {
    return this._matrixPublicArchiveURLCreator.archiveJumpUrlForRoom(
      this._entry?.content?.['canonicalAlias'] || this._entry.roomId,
      {
        dir: DIRECTION.forward,
        currentRangeStartTs: this.jumpRangeStartTimestamp,
        currentRangeEndTs: this.jumpRangeEndTimestamp,
        timelineStartEventId: this.timelineStartEventId,
        timelineEndEventId: this.timelineEndEventId,
      }
    );
  }
}

module.exports = JumpToNextActivitySummaryTileViewModel;
