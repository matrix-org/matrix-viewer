'use strict';

const { TemplateView, ListView, text } = require('hydrogen-view-sdk');

const MatrixLogoView = require('./MatrixLogoView');
const RoomCardView = require('./RoomCardView');

class RoomDirectoryView extends TemplateView {
  render(t, vm) {
    // Make sure we don't overwrite the search input value if someone has typed
    // before the JavaScript has loaded
    const searchInputBeforeRendering = document.querySelector('.RoomDirectoryView_searchInput');
    if (searchInputBeforeRendering) {
      const searchInputValueBeforeRendering = searchInputBeforeRendering.value;
      vm.setSearchTerm(searchInputValueBeforeRendering);
    }

    const roomList = new ListView(
      {
        className: 'RoomDirectoryView_roomList',
        list: vm.rooms,
        parentProvidesUpdates: false,
      },
      (room) => {
        return new RoomCardView(room);
      }
    );

    const availableHomeserverOptionElements = vm.availableHomeserverList.map((homeserverName) => {
      return t.option({ value: homeserverName }, homeserverName);
    });

    const homeserverSelectElement = t.select(
      {
        className: 'RoomDirectoryView_homeserverSelector',
        name: 'homeserver',
        onInput: (event) => vm.setHomeserverSelection(event.target.value),
      },
      [
        ...availableHomeserverOptionElements,

        t.map(
          (vm) => vm.addedHomeserversList,
          (_, t, vm) => {
            const addedHomeserverOptionElements = vm.addedHomeserversList.map((homeserverName) => {
              return t.option({ value: homeserverName }, homeserverName);
            });

            let addedHomeserversOptGroup = text('');
            if (addedHomeserverOptionElements.length > 0) {
              addedHomeserversOptGroup = t.optgroup(
                { label: 'Added servers' },
                addedHomeserverOptionElements
              );
            }

            return addedHomeserversOptGroup;
          }
        ),
        t.optgroup({ label: 'Actions' }, [
          t.option({ value: 'action:add-new-server' }, 'Add new server...'),
          t.option(
            {
              value: 'action:clear-servers',
              disabled: (vm) => {
                return vm.addedHomeserversList.length === 0;
              },
            },
            'Clear servers...'
          ),
        ]),
      ]
    );

    t.mapSideEffect(
      (vm) => vm.homeserverSelection,
      (homeserverSelection /*, oldHomeserverSelection*/) => {
        homeserverSelectElement.value = homeserverSelection;
      }
    );

    return t.div(
      {
        className: {
          RoomDirectoryView: true,
        },
      },
      [
        t.header({ className: 'RoomDirectoryView_header' }, [
          t.form({ className: 'RoomDirectoryView_headerForm', method: 'GET' }, [
            t.a(
              {
                className: 'RoomDirectoryView_matrixLogo',
                title: 'Matrix Public Archive',
                href: vm.roomDirectoryUrl,
              },
              [t.view(new MatrixLogoView(vm))]
            ),
            t.h3(
              { className: 'RoomDirectoryView_subHeader' },
              'Browse thousands of rooms using Matrix...'
            ),
            t.div({ className: 'RoomDirectoryView_search' }, [
              t.svg(
                {
                  className: 'RoomDirectoryView_searchIcon',
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
              t.input({
                type: 'search',
                className: 'RoomDirectoryView_searchInput',
                placeholder: 'Search rooms',
                name: 'search',
                value: vm.searchTerm,
                // Autocomplete is disabled because browsers share autocomplete
                // suggestions across domains and this uses a very common
                // `name="search"`. The name is important because it's what
                // shows up in the query parameters when the `<form
                // method="GET">` is submitted. I wish we could scope the
                // autocomplete suggestions to the apps domain
                // (https://github.com/whatwg/html/issues/8284). Trying some
                // custom non-spec value here also doesn't seem to work (Chrome
                // decides to autofill based on `name="search"`).
                autocomplete: 'off',
                autocapitalize: 'off',
                'data-testid': 'room-directory-search-input',
              }),
            ]),
            t.div({ className: 'RoomDirectoryView_homeserverSelectSection' }, [
              t.div({}, 'Show: Matrix rooms on'),
              homeserverSelectElement,
            ]),
          ]),
        ]),
        t.main({ className: 'RoomDirectoryView_mainContent' }, [
          t.view(roomList),
          t.div({ className: 'RoomDirectoryView_paginationButtonCombo' }, [
            t.a(
              { className: 'RoomDirectoryView_paginationButton', href: vm.prevPageUrl },
              'Previous'
            ),
            t.a({ className: 'RoomDirectoryView_paginationButton', href: vm.nextPageUrl }, 'Next'),
          ]),
        ]),
      ]
    );
  }
}

module.exports = RoomDirectoryView;
