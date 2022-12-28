'use strict';

const { TemplateView, AvatarView } = require('hydrogen-view-sdk');
const AvatarViewModel = require('../viewmodels/AvatarViewModel');

class FilterCardView extends TemplateView {
  render(t, vm) {
    const avatarViewModel = new AvatarViewModel({
      homeserverUrlToPullMediaFrom: vm.homeserverUrlToPullMediaFrom,
      avatarTitle: 'NSFW room filtered by safe search',
      avatarLetterString: 'X',
      entityId: vm.roomId,
    });

    const aliasOrRoomId = vm.canonicalAlias || vm.roomId;
    const displayName = vm.name || aliasOrRoomId;

    return t.li(
      {
        className: {
          FilterCardView: true,
        },
        'data-room-id': vm.roomId,
        'data-testid': 'room-card',
      },
      [
        t.div(
          {
            className: 'RoomCardView_header',
            // Since this is the same button as the "View" link, just tab to
            // that instead
            tabindex: -1,
          },
          [
            t.view(new AvatarView(avatarViewModel, 24)),
            t.h4(
              {
                className: 'RoomCardView_headerTitle',
                // We add a title so a tooltip shows the full name on hover
                title: 'NSFW room filtered by safe search',
              },
              'NSFW room filtered by safe search'
            ),
          ]
        ),
        t.p(
          {
            className: 'FilterCardView_topic',
            title:
              'This room was filtered because safe search is turned on and may containe explicit content.Turn off safe search to see this room',
          },
          'This room was filtered because safe search is turned on and may containe explicit content. Turn off safe search to see this room'
        ),
        t.div({ className: 'RoomCardView_footer' }, [
          t.div({ className: 'FilterCardView_footerInner' }, [
            t.a(
              {
                className: 'RoomCardView_viewButtonWrapperLink',
                href: vm.archiveRoomUrl,
                title: `View the ${displayName} room`,
              },
              t.span(
                {
                  className: 'RoomCardView_viewButton',
                },
                ['View']
              )
            ),
          ]),
        ]),
      ]
    );
  }
}

module.exports = FilterCardView;
