// Extending the Hydrogen utilities to add our custom tiles

import { tileClassForEntry, viewClassForTile } from 'hydrogen-view-sdk';

import JumpToPreviousActivitySummaryTileViewModel from 'matrix-public-archive-shared/viewmodels/JumpToPreviousActivitySummaryTileViewModel.js';
import JumpToPreviousActivitySummaryTileView from 'matrix-public-archive-shared/views/JumpToPreviousActivitySummaryTileView.js';
import JumpToNextActivitySummaryTileViewModel from 'matrix-public-archive-shared/viewmodels/JumpToNextActivitySummaryTileViewModel.js';
import JumpToNextActivitySummaryTileView from 'matrix-public-archive-shared/views/JumpToNextActivitySummaryTileView.js';

function customTileClassForEntry(entry) {
  switch (entry.eventType) {
    case 'org.matrix.archive.jump_to_previous_activity_summary':
      return JumpToPreviousActivitySummaryTileViewModel;
    case 'org.matrix.archive.jump_to_next_activity_summary':
      return JumpToNextActivitySummaryTileViewModel;
    default:
      return tileClassForEntry(entry);
  }
}

function customViewClassForTile(vm) {
  switch (vm.shape) {
    case 'org.matrix.archive.jump_to_previous_activity_summary:shape':
      return JumpToPreviousActivitySummaryTileView;
    case 'org.matrix.archive.jump_to_next_activity_summary:shape':
      return JumpToNextActivitySummaryTileView;
    default:
      return viewClassForTile(vm);
  }
}

export { customTileClassForEntry, customViewClassForTile };
