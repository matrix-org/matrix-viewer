const { TemplateView } = require('hydrogen-view-sdk');

class RightPanelContentView extends TemplateView {
  render(t, vm) {
    return t.div(
      {
        className: {
          todo: true,
        },
      },
      [t.div('test')]
    );
  }
}

module.exports = RightPanelContentView;
