'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

const CalendarView = require('matrix-public-archive-shared/views/CalendarView');
const TimeSelectorView = require('matrix-public-archive-shared/views/TimeSelectorView');
const assert = require('matrix-public-archive-shared/lib/assert');

class RightPanelContentView extends TemplateView {
  render(t, vm) {
    assert(vm.shouldIndex !== undefined);
    let maybeIndexedMessage = 'This room is not being indexed by search engines.';
    if (vm.shouldIndex) {
      maybeIndexedMessage = 'This room is being indexed by search engines.';
    }

    return t.div(
      {
        className: {
          RightPanelContentView: true,
        },
      },
      [
        t.div({}, [
          t.view(new CalendarView(vm.calendarViewModel)),
          t.view(new TimeSelectorView(vm.timeSelectorViewModel)),
        ]),
        t.div(
          {
            className: {
              RightPanelContentView_footer: true,
            },
          },
          [
            t.p(maybeIndexedMessage),
            t.div(
              {
                className: {
                  RightPanelContentView_footerLinkList: true,
                },
              },
              [
                t.a(
                  { className: 'RightPanelContentView_footerLink', href: vm.developerOptionsUrl },
                  ['Developer options']
                ),
                t.span('·'),
                t.a(
                  {
                    className: 'RightPanelContentView_footerLink',
                    href: 'https://matrix.org/',
                    target: '_blank',
                  },
                  ['Matrix.org']
                ),
              ]
            ),
          ]
        ),
      ]
    );
  }
}

module.exports = RightPanelContentView;
