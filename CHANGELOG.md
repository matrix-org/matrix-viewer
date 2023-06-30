# 0.2.0 - _upcoming_

- Prevent Cloudflare from overriding our own 504 timeout page, https://github.com/matrix-org/matrix-public-archive/pull/228
- Catch NSFW rooms with underscores, https://github.com/matrix-org/matrix-public-archive/pull/231
- Fix `18+` false positives with NSFW check, https://github.com/matrix-org/matrix-public-archive/pull/279
- Fix room cards sorting in the wrong direction on Firefox, https://github.com/matrix-org/matrix-public-archive/pull/261
- Remove `libera.chat` as a default since their rooms are not accessible in the archive, https://github.com/matrix-org/matrix-public-archive/pull/263
- Add reason why the archive bot is joining the room, https://github.com/matrix-org/matrix-public-archive/pull/262
- Add `/faq` redirect, https://github.com/matrix-org/matrix-public-archive/pull/265
- Use `rel=canonical` link to de-duplicate event permalinks, https://github.com/matrix-org/matrix-public-archive/pull/266, https://github.com/matrix-org/matrix-public-archive/pull/269
- Prevent join event spam with stable `reason`, https://github.com/matrix-org/matrix-public-archive/pull/268
- Don't allow previewing `shared` history rooms, https://github.com/matrix-org/matrix-public-archive/pull/239
  - Contributed by [@tulir](https://github.com/tulir)
- Update FAQ to explain `world_readable` only, https://github.com/matrix-org/matrix-public-archive/pull/277
- Indicate when the room was set to `world_readable` and by who, https://github.com/matrix-org/matrix-public-archive/pull/278
- Only show `world_readable` rooms in the room directory, https://github.com/matrix-org/matrix-public-archive/pull/276

Developer facing:

- Fix eslint trying to look at `node_modules/`, https://github.com/matrix-org/matrix-public-archive/pull/275

# 0.1.0 - 2023-05-11

- Initial public release with good enough functionality to be generally available including: room directory homepage, room archive view with calendar jump-to-date, drill-down with the time selector, following room upgrades (tombstone/predecessor), and more. Completed milestone: https://github.com/matrix-org/matrix-public-archive/milestone/1
