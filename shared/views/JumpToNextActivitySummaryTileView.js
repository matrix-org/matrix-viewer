const { TemplateView } = require('hydrogen-view-sdk');

class JumpToNextActivitySummaryTileView extends TemplateView {
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
      throw new Error(`Unknown kind=${kind} passed to JumpToNextActivitySummaryTileView`);
    }

    return t.div(
      {
        className: {
          JumpToNextActivitySummaryTileView: true,
          // Used by page loaded JavaScript to quickly jump the scroll viewport down
          // while we wait for the rest of the JavaScript to load.
          'js-bottom-scroll-anchor': true,
        },
      },
      [
        t.if(
          (/*vm*/) => !!daySummaryMessage,
          (t /*, vm*/) =>
            t.p(
              {
                className: 'JumpToNextActivitySummaryTileView_summaryMessage',
                'data-testid': `not-enough-events-summary-kind-${kind}`,
              },
              daySummaryMessage
            )
        ),
        t.a(
          {
            className: 'JumpToActivitySummaryTileView_activityLink',
            href: vm.jumpToNextActivityUrl,
            'data-testid': 'jump-to-next-activity-link',
          },
          [
            'Jump to the next activity in the room',
            t.svg(
              {
                className: 'JumpToActivitySummaryTileView_activityIcon',
                xmlns: 'http://www.w3.org/2000/svg',
                width: '16',
                height: '16',
                viewBox: '0 0 16 16',
                fill: 'currentColor',
                'aria-hidden': 'true',
              },
              [
                t.path({
                  d: 'M0 4v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H2a2 2 0 0 0-2 2Zm4.271 1.055a.5.5 0 0 1 .52.038L8 7.386V5.5a.5.5 0 0 1 .79-.407l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 8 10.5V8.614l-3.21 2.293A.5.5 0 0 1 4 10.5v-5a.5.5 0 0 1 .271-.445Z',
                }),
              ]
            ),
          ]
        ),
      ]
    );
  }
}

module.exports = JumpToNextActivitySummaryTileView;
