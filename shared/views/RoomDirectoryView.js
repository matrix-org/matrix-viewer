'use strict';

const { TemplateView, ListView } = require('hydrogen-view-sdk');

const MatrixLogoView = require('./MatrixLogoView');
const RoomCardView = require('./RoomCardView');

class RoomDirectoryView extends TemplateView {
  render(t, vm) {
    const roomList = new ListView(
      {
        className: 'room-directory-list',
        list: vm.rooms,
        parentProvidesUpdates: false,
      },
      (room) => {
        return new RoomCardView(room);
      }
    );

    return t.div(
      {
        className: {
          RoomDirectoryView: true,
        },
      },
      [
        t.header({ className: 'room-directory-header' }, [
          t.div(
            { className: 'room-directory-matrix-logo', 'aria-label': 'Matrix Public Archive' },
            [t.view(new MatrixLogoView(vm))]
          ),
          t.h3(
            { className: 'room-directory-sub-heading' },
            'Browse thousands of rooms using Matrix...'
          ),
          t.div({ className: 'room-directory-search' }, [
            t.svg(
              {
                className: 'room-directory-search-icon',
                viewBox: '0 0 18 18',
                fill: 'currentColor',
                xmlns: 'http://www.w3.org/2000/svg',
              },
              [
                t.path({
                  'fill-rule': 'evenodd',
                  'clip-rule': 'evenodd',
                  d: 'M12.1333 8.06667C12.1333 10.3126 10.3126 12.1333 8.06667 12.1333C5.82071 12.1333 4 10.3126 4 8.06667C4 5.82071 5.82071 4 8.06667 4C10.3126 4 12.1333 5.82071 12.1333 8.06667ZM12.9992 11.5994C13.7131 10.6044 14.1333 9.38463 14.1333 8.06667C14.1333 4.71614 11.4172 2 8.06667 2C4.71614 2 2 4.71614 2 8.06667C2 11.4172 4.71614 14.1333 8.06667 14.1333C9.38457 14.1333 10.6043 13.7131 11.5992 12.9993C11.6274 13.0369 11.6586 13.0729 11.6928 13.1071L14.2928 15.7071C14.6833 16.0977 15.3165 16.0977 15.707 15.7071C16.0975 15.3166 16.0975 14.6834 15.707 14.2929L13.107 11.6929C13.0728 11.6587 13.0368 11.6276 12.9992 11.5994Z',
                }),
              ]
            ),
            t.input({ className: 'room-directory-search-input', placeholder: 'Search rooms' }),
          ]),
          t.div({ className: 'room-directory-homeserver-select-section' }, [
            t.div({}, 'Show: Matrix rooms on'),
            t.select({ className: 'room-directory-homeserver-selector' }, [
              t.option({}, 'matrix.org'),
            ]),
          ]),
        ]),
        t.main({ className: 'RoomDirectoryView_mainContent' }, [t.view(roomList)]),
      ]
    );
  }
}

module.exports = RoomDirectoryView;
