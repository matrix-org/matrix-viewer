'use strict';

const { SimpleTile } = require('hydrogen-view-sdk');

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

  // The end of the range to use as a jumping off point to the next activity
  get rangeEndTimestamp() {
    return this._entry?.content?.['rangeEndTimestamp'];
  }

  get jumpToNextActivityUrl() {
    return this._matrixPublicArchiveURLCreator.archiveJumpUrlForRoom(
      this._entry?.content?.['canonicalAlias'] || this._entry.roomId,
      {
        // We `+ 1` so we don't jump to the same event because the endpoint is inclusive
        ts: this.rangeEndTimestamp + 1,
        dir: 'f',
      }
    );
  }
}

module.exports = JumpToNextActivitySummaryTileViewModel;
