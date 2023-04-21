import { TemplateView } from 'hydrogen-view-sdk';

import CalendarView from 'matrix-public-archive-shared/views/CalendarView';
import TimeSelectorView from 'matrix-public-archive-shared/views/TimeSelectorView';
import assert from 'matrix-public-archive-shared/lib/assert';

class RightPanelContentView extends TemplateView {
  render(t, vm) {
    assert(vm.shouldIndex !== undefined);
    assert(vm.shouldShowTimeSelector !== undefined);

    let maybeIndexedMessage = 'This room is not being indexed by search engines.';
    if (vm.shouldIndex) {
      maybeIndexedMessage = 'This room is being indexed by search engines.';
    }

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
            t.p(maybeIndexedMessage),
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

export default RightPanelContentView;
