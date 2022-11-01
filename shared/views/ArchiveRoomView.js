'use strict';

const {
  TemplateView,
  AvatarView,
  TimelineView,
  RightPanelView,
  LightboxView,
} = require('hydrogen-view-sdk');

const {
  customViewClassForTile,
} = require('matrix-public-archive-shared/lib/custom-tile-utilities');

const DeveloperOptionsContentView = require('matrix-public-archive-shared/views/DeveloperOptionsContentView');
const ModalView = require('matrix-public-archive-shared/views/ModalView');

class RoomHeaderView extends TemplateView {
  render(t, vm) {
    return t.div({ className: 'RoomHeader middle-header' }, [
      t.a(
        {
          className: 'button-utility RoomHeader_actionButton',
          href: vm.roomDirectoryUrl,
          title: vm.i18n`Go back to the room directory`,
        },
        [
          // Home icon from Element
          t.svg(
            {
              xmlns: 'http://www.w3.org/2000/svg',
              width: '16',
              height: '16',
              viewBox: '0 0 24 24',
              fill: 'currentColor',
              'aria-hidden': 'true',
            },
            [
              t.path({
                d: 'M20.2804 7.90031L13.2804 2.06697C12.5387 1.4489 11.4613 1.4489 10.7196 2.06698L3.71963 7.90031C3.26365 8.28029 3 8.84319 3 9.43675V20.5C3 21.6046 3.89543 22.5 5 22.5H7C8.10457 22.5 9 21.6046 9 20.5V16C9 14.8954 9.89543 14 11 14H13C14.1046 14 15 14.8954 15 16V20.5C15 21.6046 15.8954 22.5 17 22.5H19C20.1046 22.5 21 21.6046 21 20.5V9.43675C21 8.84319 20.7364 8.28029 20.2804 7.90031Z',
              }),
            ]
          ),
        ]
      ),
      t.view(new AvatarView(vm.roomAvatarViewModel, 32)),
      t.div({ className: 'room-description' }, [t.h2((vm) => vm.roomName)]),
      t.button(
        {
          className: 'button-utility RoomHeader_actionButton RoomHeader_changeDatesButton',
          title: vm.i18n`Change dates`,
          onClick: (/*event*/) => {
            vm.openRightPanel();
          },
        },
        [
          // Calendar icon (via `calendar2-date` from Bootstrap)
          t.svg(
            {
              xmlns: 'http://www.w3.org/2000/svg',
              width: '16',
              height: '16',
              viewBox: '0 0 16 16',
              fill: 'currentColor',
              'aria-hidden': 'true',
            },
            [
              t.path({
                d: 'M6.445 12.688V7.354h-.633A12.6 12.6 0 0 0 4.5 8.16v.695c.375-.257.969-.62 1.258-.777h.012v4.61h.675zm1.188-1.305c.047.64.594 1.406 1.703 1.406 1.258 0 2-1.066 2-2.871 0-1.934-.781-2.668-1.953-2.668-.926 0-1.797.672-1.797 1.809 0 1.16.824 1.77 1.676 1.77.746 0 1.23-.376 1.383-.79h.027c-.004 1.316-.461 2.164-1.305 2.164-.664 0-1.008-.45-1.05-.82h-.684zm2.953-2.317c0 .696-.559 1.18-1.184 1.18-.601 0-1.144-.383-1.144-1.2 0-.823.582-1.21 1.168-1.21.633 0 1.16.398 1.16 1.23z',
              }),
              t.path({
                d: 'M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM2 2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H2z',
              }),
              t.path({
                d: 'M2.5 4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V4z',
              }),
            ]
          ),
        ]
      ),
    ]);
  }
}

class DisabledComposerView extends TemplateView {
  render(t, vm) {
    const activeDate = new Date(
      // If the date from our `archiveRoomViewModel` is available, use that
      vm?.currentTopPositionEventEntry?.timestamp ||
        // Otherwise, use our initial `dayTimestamp`
        vm.dayTimestamp
    );
    const dateString = activeDate.toISOString().split('T')[0];

    return t.div({ className: 'DisabledComposerView' }, [
      t.h3([
        `You're viewing an archive of events from ${dateString}. Use a `,
        t.a(
          {
            href: (vm) => vm.roomPermalink,
            rel: 'noopener',
            target: '_blank',
          },
          ['Matrix client']
        ),
        ` to start chatting in this room.`,
      ]),
    ]);
  }
}

class ArchiveRoomView extends TemplateView {
  render(t, vm) {
    const rootElement = t.div(
      {
        className: {
          ArchiveRoomView: true,
          'right-shown': (vm) => vm.shouldShowRightPanel,
        },
      },
      [
        // The red border and yellow background trail around the event that is
        // driving the active date as you scroll around.
        t.if(
          (vm) => vm._developerOptionsViewModel?.debugActiveDateIntersectionObserver,
          (t /*, vm*/) => {
            return t.style({}, (vm) => {
              return `
                [data-event-id] {
                  transition: background-color 800ms;
                }
                [data-event-id="${vm.currentTopPositionEventEntry?.id}"] {
                  background-color: #ffff8a;
                  outline: 1px solid #f00;
                  outline-offset: -1px;
                  transition: background-color 0ms;
                }
              `;
            });
          }
        ),
        t.main({ className: 'ArchiveRoomView_mainArea' }, [
          t.view(new RoomHeaderView(vm)),
          t.main({ className: 'ArchiveRoomView_mainBody' }, [
            t.view(
              new TimelineView(vm.timelineViewModel, { viewClassForTile: customViewClassForTile })
            ),
            t.view(new DisabledComposerView(vm)),
          ]),
        ]),
        t.view(new RightPanelView(vm.rightPanelModel)),
        t.mapView(
          (vm) => vm.lightboxViewModel,
          (lightboxViewModel) => (lightboxViewModel ? new LightboxView(lightboxViewModel) : null)
        ),
        t.view(new ModalView(DeveloperOptionsContentView, vm.developerOptionsModalViewModel)),
      ]
    );

    if (typeof IntersectionObserver === 'function') {
      const scrollRoot = rootElement.querySelector('.Timeline_scroller');
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const eventId = entry.target.getAttribute('data-event-id');
              const eventEntry = vm.eventEntriesByEventId[eventId];
              vm.setCurrentTopPositionEventEntry(eventEntry);
            }
          });
        },
        {
          root: scrollRoot,
          // Select the current active day from the top-edge of the scroll viewport.
          //
          // This is a trick that pushes the bottom margin up to the top of the
          // root so there is just a 0px region at the top to detect
          // intersections. This way we always recognize the element at the top.
          // As mentioned in:
          //  - https://stackoverflow.com/a/54874286/796832
          //  - https://css-tricks.com/an-explanation-of-how-the-intersection-observer-watches/#aa-creating-a-position-sticky-event
          //
          // The format is the same as margin: top, left, bottom, right.
          rootMargin: '0px 0px -100% 0px',
          threshold: 0,
        }
      );
      [...scrollRoot.querySelectorAll(`:scope > ul > [data-event-id]`)].forEach((el) => {
        observer.observe(el);
      });
    }

    return rootElement;
  }
}

module.exports = ArchiveRoomView;
