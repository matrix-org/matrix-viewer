'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

class NotEnoughEventsFromDaySummaryTileView extends TemplateView {
  render(t, vm) {
    const kind = vm.daySummaryKind;
    let selectedDayString = 'the day you selected';
    if (vm.dayTimestamp) {
      selectedDayString = new Date(vm.dayTimestamp).toISOString().split('T')[0];
    }

    let daySummaryMessage;
    if (kind === 'no-events-at-all') {
      daySummaryMessage = `We couldn't find any activity at or before ${selectedDayString}.`;
    } else if (kind === 'no-events-in-day') {
      daySummaryMessage = `We couldn't find any activity for ${selectedDayString}. But there is activity before this day as shown above.`;
    } else if (kind === 'some-events-in-day') {
      daySummaryMessage = null;
    } else {
      throw new Error(`Unknown kind=${kind} passed to NotEnoughEventsFromDaySummaryTileView`);
    }

    return t.div(
      {
        className: 'NotEnoughEventsFromDaySummaryTileView',
        'data-event-id': vm.eventId,
      },
      [
        t.if(
          (vm) => daySummaryMessage,
          (t, vm) =>
            t.p(
              { className: 'NotEnoughEventsFromDaySummaryTileView_summaryMessage' },
              daySummaryMessage
            )
        ),
        t.a({ href: vm.jumpToNextActivityUrl }, 'Jump to the next activity in the room.'),
      ]
    );
  }
}

module.exports = NotEnoughEventsFromDaySummaryTileView;
