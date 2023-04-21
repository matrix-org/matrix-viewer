import { TemplateView, AvatarView } from 'hydrogen-view-sdk';
import AvatarViewModel from '../viewmodels/AvatarViewModel';

class RoomCardView extends TemplateView {
  render(t, vm) {
    const avatarViewModel = new AvatarViewModel({
      homeserverUrlToPullMediaFrom: vm.homeserverUrlToPullMediaFrom,
      avatarUrl: vm.mxcAvatarUrl,
      avatarTitle: vm.name || vm.canonicalAlias || vm.roomId,
      avatarLetterString:
        vm.name ||
        // Skip to the first letter after the `#` sigil from the alias
        vm.canonicalAlias?.[1] ||
        // Skip to the first letter after the `!` sigil from the room ID
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

export default RoomCardView;
