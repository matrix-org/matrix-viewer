'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

class JumpToPreviousActivitySummaryTileView extends TemplateView {
  render(t, vm) {
    return t.div(
      {
        className: 'JumpToPreviousActivitySummaryTileView',
        'data-event-id': vm.eventId,
      },
      [
        t.a(
          {
            className: 'JumpToActivitySummaryTileView_activityLink',
            href: vm.jumpToPreviousActivityUrl,
          },
          [
            'Jump to previous activity in the room',
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

module.exports = JumpToPreviousActivitySummaryTileView;
