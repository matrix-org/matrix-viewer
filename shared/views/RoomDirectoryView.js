'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

class RoomDirectoryView extends TemplateView {
  render(t, vm) {
    return t.div(
      {
        className: {
          RoomDirectoryView: true,
        },
      },
      ['RoomDirectoryView']
    );
  }
}

module.exports = RoomDirectoryView;
