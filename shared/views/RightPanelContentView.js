'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

const CalendarView = require('matrix-public-archive-shared/views/CalendarView');

class RightPanelContentView extends TemplateView {
  render(t, vm) {
    return t.div(
      {
        className: {
          todo: true,
        },
      },
      [t.view(new CalendarView(vm.calendarViewModel))]
    );
  }
}

module.exports = RightPanelContentView;
