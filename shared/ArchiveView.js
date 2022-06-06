'use strict';

const { TemplateView, RoomView, RightPanelView, viewClassForTile } = require('hydrogen-view-sdk');

class ArchiveView extends TemplateView {
  render(t, vm) {
    return t.div(
      {
        className: {
          ArchiveView: true,
        },
      },
      [
        t.view(new RoomView(vm.roomViewModel, viewClassForTile)),
        t.view(new RightPanelView(vm.rightPanelModel)),
      ]
    );
  }
}

module.exports = ArchiveView;
