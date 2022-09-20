'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

class NotEnoughEventsFromDaySummaryTileView extends TemplateView {
  render(t, vm) {
    return t.div(
      { className: 'NotEnoughEventsFromDaySummaryTileView' },
      'foobarbaz NotEnoughEventsFromDaySummaryTileView'
    );
  }
}

module.exports = NotEnoughEventsFromDaySummaryTileView;
