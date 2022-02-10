const { TemplateView, RoomView, RightPanelView } = require('hydrogen-view-sdk');

class ArchiveView extends TemplateView {
  render(t, vm) {
    return t.div(
      {
        className: {
          ArchiveView: true,
        },
      },
      [t.view(new RoomView(vm.roomViewModel)), t.view(new RightPanelView(vm.rightPanelModel))]
    );
  }
}

module.exports = ArchiveView;
