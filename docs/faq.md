# FAQ

## Can I run my own instance?

Yes! We host a public canonical version of the Matrix Public Archive at
[archive.matrix.org](https://archive.matrix.org/) that everyone can use but feel free to
also run your own instance (setup instructions in the [readme](../README.md)).

## How is this different from [`view.matrix.org`](https://view.matrix.org/)?

https://view.matrix.org/ (https://github.com/matrix-org/matrix-static) already existed
before the Matrix Public Archive but there was some desire to make something with more
Element-feeling polish and loading faster (avoid the slow 502's errors that are frequent
on `view.matrix.org`).

And with the introduction of the jump to date API via
[MSC3030](https://github.com/matrix-org/matrix-spec-proposals/pull/3030), we could show
messages from any given date and day-by-day navigation.

## Why did the archive bot join my room?

Only public Matrix rooms with `shared` or `world_readable` [history
visibility](https://spec.matrix.org/v1.7/client-server-api/#room-history-visibility) are
accessible in the Matrix Public Archive.

But the archive bot (`@archive:matrix.org`) will join any public room because it doesn't
know the history visibility without first joining. Any room without `world_readable` or
`shared` history visibility will lead a `403 Forbidden`. And if the public room is in
the room directory, it will be listed in the archive but will still lead to a `403
Forbidden` in that case.

The Matrix Public Archive doesn't hold onto any data (it's
stateless) and requests the messages from the homeserver every time. The
[archive.matrix.org](https://archive.matrix.org/) instance has some caching in place, 5
minutes for the current day, and 2 days for past content.

The Matrix Public Archive only allows rooms with `world_readable` history visibility to
be indexed by search engines. See the [opt
out](#how-do-i-opt-out-and-keep-my-room-from-being-indexed-by-search-engines) topic
below for more details.

### Why does the archive user join rooms instead of browsing them as a guest?

Guests require `m.room.guest_access` to access a room. Most public rooms do not allow
guests because even the `public_chat` preset when creating a room does not allow guest
access. Not being able to view most public rooms is the major blocker on being able to
use guest access. The idea is if I can view the messages from a Matrix client as a
random user, I should also be able to see the messages in the archive.

Guest access is also a much different ask than read-only access since guests can also
send messages in the room which isn't always desirable. The archive bot is read-only and
does not send messages.

## How do I opt out and keep my room from being indexed by search engines?

Only public Matrix rooms with `shared` or `world_readable` history visibility are
accessible to view in the Matrix Public Archive. But only rooms with history visibility
set to `world_readable` are indexable by search engines.

Also see https://github.com/matrix-org/matrix-public-archive/issues/47 to track better
opt out controls.

As a workaround for [archive.matrix.org](https://archive.matrix.org/) today, you can ban
the `@archive:matrix.org` user if you don't want your room content to be shown in the
archive at all.

## Technical details

The main readme has a [technical overview](../README.md#technical-overview) of the
project. Here are a few more details.

### How do I figure out what version of the Matrix Public Archive is running?

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

### How does the archive room URL relate to what is displayed on the page?

We start the end of the date/time specified in the URL looking backward up to the limit.

### Why does the time selector only appear for some pages?

The time selector only appears for pages that have a lot of messages on a given
day/hour/minute/second (more than the configured `archiveMessageLimit`).
