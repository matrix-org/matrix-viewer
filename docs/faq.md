# FAQ

## Can I run my own instance?

Yes! We host a public canonical version of the Matrix Viewer at
_(incoming)_ that everyone can use but feel free to
also run your own instance (setup instructions in the [readme](../README.md)).

## How is this different from the `matrix-static` project?

[Matrix Static](https://github.com/matrix-org/matrix-static) already existed
before the Matrix Viewer but there was some desire to make something with more
Element-feeling polish and loading faster (avoid the slow 502's errors that are frequent
on `view.matrix.org`).

And with the introduction of the jump to date API via
[MSC3030](https://github.com/matrix-org/matrix-spec-proposals/pull/3030), we could show
messages from any given date and day-by-day navigation.

The Matrix Viewer project has since replaced the `matrix-static` project on
[`view.matrix.org`](https://view.matrix.org/).

## Why did the bot join my room?

Only Matrix rooms with `world_readable` [history
visibility](https://spec.matrix.org/latest/client-server-api/#room-history-visibility)
are accessible in the Matrix Viewer and indexed by search engines.

But the bot (`@view:matrix.org`) will join any public room because it doesn't
know the history visibility without first joining. Any room that doesn't have
`world_readable` history visibility will lead a `403 Forbidden`.

The Matrix Viewer hold onto any data (it's
stateless) and requests the messages from the homeserver every time. The
[view.matrix.org](https://view.matrix.org/) instance has some caching in place, 5
minutes for the current day, and 2 days for past content.

See the [opt out
section](#how-do-i-opt-out-and-keep-my-room-from-being-indexed-by-search-engines) below
for more details.

## How do I opt out and keep my room from being indexed by search engines?

Only Matrix rooms with `world_readable` [history
visibility](https://spec.matrix.org/latest/client-server-api/#room-history-visibility)
are accessible in the Matrix Viewer and indexed by search engines. One easy way
to opt-out is to change your rooms history visibility to something else if you don't
intend for your room be world readable.

Dedicated opt-out controls are being tracked in
[#47](https://github.com/matrix-org/matrix-viewer/issues/47).

As a workaround for [view.matrix.org](https://view.matrix.org/), you can ban the
`@view:matrix.org` user if you don't want your room content to be shown at all.

### Why does the bot user join rooms instead peeking in the room or using guests?

Since Matrix Viewer only displays rooms with `world_readable` history visibility, we could
peek into the rooms without joining. This is being explored in
[#272](https://github.com/matrix-org/matrix-viewer/pull/272). But peeking
doesn't work when the server doesn't know about the room already (this is commonly
referred to as federated peeking) which is why we have to fallback to joining the room
in any case. We could solve the federated peeking problem and avoid the join with
[MSC3266 room summaries](https://github.com/matrix-org/matrix-spec-proposals/pull/3266)
to check whether the room is `world_readable` even over federation.

Guests are completely separate concept and controlled by the `m.room.guest_access` state
event in the room. Guest access is also a much different ask than read-only access since
guests can also send messages in the room which isn't always desirable. The bot
is read-only and does not send messages.

## Technical details

The main readme has a [technical overview](../README.md#technical-overview) of the
project. Here are a few more details.

### How do I figure out what version of the Matrix Viewer is running?

Just visit the `/health-check` endpoint which will return information like the following:

```
{
  "ok": true,
  "commit": "954b22995a44bf11bfcd5850b62e206e46ee2db9",
  "version": "main",
  "versionDate": "2023-04-05T09:26:12.524Z",
  "packageVersion": "0.0.0"
}
```

### How does the room URL relate to what is displayed on the page?

We start the end of the date/time specified in the URL looking backward up to the limit.

### Why does the time selector only appear for some pages?

The time selector only appears for pages that have a lot of messages on a given
day/hour/minute/second (more than the configured `messageLimit`).
