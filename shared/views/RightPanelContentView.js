'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

const assert = require('matrix-viewer-shared/lib/assert');
const CalendarView = require('matrix-viewer-shared/views/CalendarView');
const TimeSelectorView = require('matrix-viewer-shared/views/TimeSelectorView');

class RightPanelContentView extends TemplateView {
  render(t, vm) {
    assert(vm.shouldIndex !== undefined);
    assert(vm.shouldShowTimeSelector !== undefined);
    assert(vm.historyVisibilityEventMeta.historyVisibility);
    assert(vm.historyVisibilityEventMeta.sender);
    assert(vm.historyVisibilityEventMeta.originServerTs);

    let maybeIndexedMessage = 'This room is not being indexed by search engines ';
    if (vm.shouldIndex) {
      maybeIndexedMessage = 'This room is being indexed by search engines';
    }

    const historyVisibilitySender = vm.historyVisibilityEventMeta.sender;

    let historyVisibilityDisplayValue = vm.historyVisibilityEventMeta.historyVisibility;
    if (vm.historyVisibilityEventMeta.historyVisibility === 'world_readable') {
      historyVisibilityDisplayValue = 'world readable';
    }

    const [historyVisibilitySetDatePiece, _timePiece] = new Date(
      vm.historyVisibilityEventMeta.originServerTs
    )
      .toISOString()
      .split('T');

    return t.div(
      {
        className: 'RightPanelContentView',
      },
      [
        t.div({ className: 'RightPanelContentView_mainContent' }, [
          t.view(new CalendarView(vm.calendarViewModel)),
          t.ifView(
            (vm) => vm.shouldShowTimeSelector,
            (vm) => new TimeSelectorView(vm.timeSelectorViewModel)
          ),
        ]),
        t.footer(
          {
            className: 'RightPanelContentView_footer',
          },
          [
            t.p([
              `This room is accessible because it was set to ` +
                `${historyVisibilityDisplayValue} by ${historyVisibilitySender} on ${historyVisibilitySetDatePiece}.`,
            ]),
            t.p([
              maybeIndexedMessage,
              ' (',
              t.a(
                {
                  className: 'external-link RightPanelContentView_footerLink',
                  href: 'https://github.com/matrix-org/matrix-viewer/blob/main/docs/faq.md#how-do-i-opt-out-and-keep-my-room-from-being-indexed-by-search-engines',
                  target: '_blank',
                },
                'more info'
              ),
              ').',
            ]),
            t.div(
              {
                className: 'RightPanelContentView_footerLinkList',
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
