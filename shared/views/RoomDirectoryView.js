'use strict';

const { TemplateView, ListView, text } = require('hydrogen-view-sdk');

const ModalView = require('matrix-public-archive-shared/views/ModalView');
const HomeserverSelectionModalContentView = require('./HomeserverSelectionModalContentView');
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
        onInput: (event) => {
          const optionValue = event.target.value;
          if (optionValue.startsWith('action:')) {
            const action = optionValue;
            vm.onHomeserverSelectionAction(action);
            // You can't select one of the actions. set the <select> back to their
            // original selection
            event.target.value = vm.homeserverSelection;
          } else {
            const newHomeserver = optionValue;
            vm.setHomeserverSelection(newHomeserver);
          }
        },
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

    const headerForm = t.form({ className: 'RoomDirectoryView_headerForm', method: 'GET' }, [
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
        t.view(
          new ModalView(HomeserverSelectionModalContentView, vm.homeserverSelectionModalViewModel)
        ),
      ]),
    ]);

    // Make sure the `<select>` is updated when the ViewModel is updated
    t.mapSideEffect(
      (vm) => vm.homeserverSelection,
      (homeserverSelection, oldHomeserverSelection) => {
        homeserverSelectElement.value = homeserverSelection;

        const pickedActionOption = homeserverSelection.startsWith('action:');
        const isInitialization = oldHomeserverSelection === undefined;
        if (!pickedActionOption && !isInitialization) {
          // Submit the page with the new homeserver selection to get results
          headerForm.submit();
        }
      }
    );

    return t.div(
      {
        className: {
          RoomDirectoryView: true,
        },
      },
      [
        t.header({ className: 'RoomDirectoryView_header' }, [headerForm]),
        t.main({ className: 'RoomDirectoryView_mainContent' }, [
          t.if(
            (vm) => vm.roomFetchError,
            (t, vm) => {
              return t.section({ className: 'RoomDirectoryView_roomListError' }, [
                t.h3('Unable to fetch rooms from room directory'),
                t.p({}, [
                  `This may be a temporary problem with the homeserver where the room directory lives (${vm.searchParameters.homeserver}) or the homeserver that the archive is pulling from (${vm.homeserverName}). You can try adjusting your search term or select a different homeserver to look at. If this problem persists, please open a `,
                  t.a(
                    { href: 'https://github.com/matrix-org/matrix-public-archive/issues/new' },
                    'bug report'
                  ),
                  ` with all of this whole section copy-pasted into the issue.`,
                ]),
                t.p({}, `The exact error we ran into was:`),
                t.pre(
                  { className: 'RoomDirectoryView_codeBlock' },
                  t.code({}, vm.roomFetchError.stack)
                ),
                t.p({}, `The  error occured with these search paramers:`),
                t.pre(
                  { className: 'RoomDirectoryView_codeBlock' },
                  t.code({}, JSON.stringify(vm.searchParameters, null, 2))
                ),
                t.details({}, [
                  t.summary({}, 'Why are we showing so many details?'),
                  t.p({}, [
                    `We're showing as much detail as we know so you're not frustrated by a generic message with no feedback on how to move forward. This also makes it easier for you to write a `,
                    t.a(
                      { href: 'https://github.com/matrix-org/matrix-public-archive/issues/new' },
                      'bug report'
                    ),
                    ` with all the details necessary for us to triage it.`,
                  ]),
                  t.p({}, t.strong(`Isn't this a security risk?`)),
                  t.p({}, [
                    `Not really. Usually, people are worried about returning details because it makes it easier for people to know how to prod and poke and get better feedback about what's going wrong to craft exploits. But the `,
                    t.a(
                      { href: 'https://github.com/matrix-org/matrix-public-archive' },
                      'Matrix Public Archive'
                    ),
                    ` is already open source so the details of the app are already public and you can run your own instance against the same homeservers that we are to find problems.`,
                  ]),
                  t.p({}, [
                    `If you find any security vulnerabilities, please `,
                    t.a(
                      { href: 'https://matrix.org/security-disclosure-policy/' },
                      'responsibly disclose'
                    ),
                    ` them to us.`,
                  ]),
                  t.p({}, [
                    `If you have ideas on how we can present these errors better, please `,
                    t.a(
                      { href: 'https://github.com/matrix-org/matrix-public-archive/issues' },
                      'create an issue'
                    ),
                    `.`,
                  ]),
                ]),
              ]);
            }
          ),
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
