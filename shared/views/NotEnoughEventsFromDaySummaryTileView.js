'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

class NotEnoughEventsFromDaySummaryTileView extends TemplateView {
  render(t, vm) {
    let daySummaryMessage;
    const kind = vm.daySummaryKind;
    if (kind === 'no-events-at-all') {
      daySummaryMessage = `We couldn't find any activity at or before the day you selected.`;
    } else if (kind === 'no-events-in-day') {
      daySummaryMessage = `We couldn't find any activity for the day you selected. But there is activity before this day as shown above ^`;
    } else if (kind === 'some-events-in-day') {
      daySummaryMessage;
    } else {
      throw new Error(`Unknown kind=${kind} passed to NotEnoughEventsFromDaySummaryTileView`);
    }

    return t.div(
      {
        className: 'NotEnoughEventsFromDaySummaryTileView',
        'data-event-id': vm.eventId,
      },
      [
        t.p(
          { className: 'NotEnoughEventsFromDaySummaryTileView_summaryMessage' },
          daySummaryMessage
        ),
        t.a({}, 'Jump to the next activity in the room.'),
      ]
    );
  }
}

module.exports = NotEnoughEventsFromDaySummaryTileView;
