'use strict';

const { TemplateView, AvatarView } = require('hydrogen-view-sdk');
const AvatarViewModel = require('../viewmodels/AvatarViewModel');

class RoomCardView extends TemplateView {
  render(t, vm) {
    const avatarViewModel = new AvatarViewModel({
      homeserverUrlToPullMediaFrom: vm.homeserverUrlToPullMediaFrom,
      avatarUrl: vm.avatarUrl,
      avatarTitle: vm.name,
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

    return t.li(
      {
        className: {
          RoomCardView: true,
        },
      },
      [
        t.div({ className: 'RoomCardView_header' }, [
          t.view(new AvatarView(avatarViewModel, 24)),
          t.if(
            (vm) => vm.name,
            (t, vm) =>
              t.h4(
                {
                  className: 'RoomCardView_headerTitle',
                  // We add a title so a tooltip shows the full name on hover
                  title: vm.name,
                },
                vm.name
              )
          ),
        ]),
        t.a({ className: 'RoomCardView_alias', href: 'TODO' }, [vm.canonicalAlias || vm.roomId]),
        t.p({ className: 'RoomCardView_topic' }, [vm.topic || '']),
        t.div({ className: 'RoomCardView_footer' }, [
          t.div({ className: 'RoomCardView_footerInner' }, [
            t.div({}, [memberDisplay]),
            t.a({ className: 'RoomCardView_viewButton', href: 'TODO' }, 'View'),
          ]),
        ]),
      ]
    );
  }
}

module.exports = RoomCardView;
