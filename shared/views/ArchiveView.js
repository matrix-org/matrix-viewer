'use strict';

const {
  TemplateView,
  RoomView,
  RightPanelView,
  LightboxView,
  viewClassForTile,
} = require('hydrogen-view-sdk');

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
        t.mapView(
          (vm) => vm.lightboxViewModel,
          (lightboxViewModel) => (lightboxViewModel ? new LightboxView(lightboxViewModel) : null)
        ),
      ]
    );
  }
}

module.exports = ArchiveView;
