'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

const CalendarView = require('matrix-public-archive-shared/CalendarView');

class RightPanelContentView extends TemplateView {
  render(t, vm) {
    return t.div(
      {
        className: {
          todo: true,
        },
      },
      [
        t.div('test'),
        t.input({
          type: 'date',
          value: vm.calendarViewModel.date.toISOString().split('T')[0],
        }),
        t.view(new CalendarView(vm.calendarViewModel)),
      ]
    );
  }
}

module.exports = RightPanelContentView;
