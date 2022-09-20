'use strict';

// Extending the Hydrogen utilities to add our custom tiles

const { tileClassForEntry, viewClassForTile } = require('hydrogen-view-sdk');

const NotEnoughEventsFromDaySummaryTileViewModel = require('matrix-public-archive-shared/viewmodels/NotEnoughEventsFromDaySummaryTileViewModel');
const NotEnoughEventsFromDaySummaryTileView = require('matrix-public-archive-shared/views/NotEnoughEventsFromDaySummaryTileView');

function customTileClassForEntry(entry) {
  switch (entry.eventType) {
    case 'org.matrix.archive.not_enough_events_from_day_summary':
      return NotEnoughEventsFromDaySummaryTileViewModel;
    default:
      return tileClassForEntry(entry);
  }
}

function customViewClassForTile(vm) {
  switch (vm.shape) {
    case 'org.matrix.archive.not_enough_events_from_day_summary:shape':
      return NotEnoughEventsFromDaySummaryTileView;
    default:
      return viewClassForTile(vm);
  }
}

module.exports = {
  customTileClassForEntry,
  customViewClassForTile,
};
