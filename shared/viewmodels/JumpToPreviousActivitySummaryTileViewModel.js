'use strict';

const { SimpleTile } = require('hydrogen-view-sdk');

const { DIRECTION } = require('matrix-public-archive-shared/lib/reference-values');
const MatrixPublicArchiveURLCreator = require('matrix-public-archive-shared/lib/url-creator');
const assert = require('../lib/assert');

class JumpToPreviousActivitySummaryTileViewModel extends SimpleTile {
  constructor(entry, options) {
    super(entry, options);
    this._entry = entry;

    const basePath = this._entry?.content?.['basePath'];
    assert(basePath);
    this._matrixPublicArchiveURLCreator = new MatrixPublicArchiveURLCreator(basePath);
  }

  get shape() {
    return 'org.matrix.archive.jump_to_previous_activity_summary:shape';
  }

  // The start of the range to use as a jumping off point to the previous activity
  get rangeStartTimestamp() {
    return this._entry?.content?.['rangeStartTimestamp'];
  }

  // The end of the range to use as a jumping off point to the next activity
  get rangeEndTimestamp() {
    return this._entry?.content?.['rangeEndTimestamp'];
  }

  get jumpToPreviousActivityUrl() {
    return this._matrixPublicArchiveURLCreator.archiveJumpUrlForRoom(
      this._entry?.content?.['canonicalAlias'] || this._entry.roomId,
      {
        dir: DIRECTION.backward,
        currentRangeStartTs: this.rangeStartTimestamp,
        currentRangeEndTs: this.rangeEndTimestamp,
      }
    );
  }
}

module.exports = JumpToPreviousActivitySummaryTileViewModel;
