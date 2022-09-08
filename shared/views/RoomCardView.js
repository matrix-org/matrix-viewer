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

    return t.li(
      {
        className: {
          RoomCardView: true,
        },
      },
      [
        t.div({}, [
          t.view(new AvatarView(avatarViewModel, 24)),
          t.if(
            (vm) => vm.name,
            (t, vm) => t.h4(vm.name)
          ),
          t.a({ href: 'TODO' }, [vm.canonicalAlias || vm.roomId]),
        ]),
        t.if(
          (vm) => vm.topic,
          (t, vm) => t.p({}, [vm.topic])
        ),
        t.div({}, [`${vm.numJoinedMembers} members`]),
        t.a({ href: 'TODO' }, 'View'),
      ]
    );
  }
}

module.exports = RoomCardView;
