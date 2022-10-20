'use strict';

const { TemplateView, AvatarView } = require('hydrogen-view-sdk');
const AvatarViewModel = require('../viewmodels/AvatarViewModel');

class RoomCardView extends TemplateView {
  render(t, vm) {
    const avatarViewModel = new AvatarViewModel({
      homeserverUrlToPullMediaFrom: vm.homeserverUrlToPullMediaFrom,
      avatarUrl: vm.avatarUrl,
      avatarTitle: vm.name || vm.canonicalAlias || vm.roomId,
      avatarLetterString:
        vm.name ||
        // Strip the `#` off the alias
        vm.canonicalAlias?.[1] ||
        // Strip the `!` off the room_id
        vm.roomId?.[1],
      entityId: vm.roomId,
    });

    // Pluralize based on number of members in the room
    let memberDisplay = `${vm.numJoinedMembers} member`;
    if (vm.numJoinedMembers > 1) {
      memberDisplay = `${vm.numJoinedMembers} members`;
    }

    const aliasOrRoomId = vm.canonicalAlias || vm.roomId;
    const displayName = vm.name || aliasOrRoomId;

    return t.li(
      {
        className: {
          RoomCardView: true,
        },
        'data-room-id': vm.roomId,
        'data-testid': 'room-card',
      },
      [
        t.a(
          {
            className: 'RoomCardView_header',
            href: vm.archiveRoomUrl,
            // Since this is the same button as the "View" link, just tab to
            // that instead
            tabindex: -1,
          },
          [
            t.view(new AvatarView(avatarViewModel, 24)),
            t.if(
              (vm) => vm.name,
              (t /*, vm*/) =>
                t.h4(
                  {
                    className: 'RoomCardView_headerTitle',
                    // We add a title so a tooltip shows the full name on hover
                    title: displayName,
                  },
                  displayName
                )
            ),
          ]
        ),
        t.a(
          {
            className: 'RoomCardView_alias',
            href: vm.archiveRoomUrl,
            // Since this is the same button as the "View" link, just tab to
            // that instead
            tabindex: -1,
          },
          [aliasOrRoomId]
        ),
        t.p({ className: 'RoomCardView_topic', title: vm.topic || null }, [vm.topic || '']),
        t.div({ className: 'RoomCardView_footer' }, [
          t.div({ className: 'RoomCardView_footerInner' }, [
            t.div({}, [memberDisplay]),
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

module.exports = RoomCardView;
