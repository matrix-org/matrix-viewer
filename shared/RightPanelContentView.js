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
      [t.div('test'), t.view(new CalendarView(vm.calendarViewModel))]
    );
  }
}

module.exports = RightPanelContentView;
