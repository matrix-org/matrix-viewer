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
[MSC3030](https://github.com/matrix-org/matrix-spec-proposals/pull/3030), we could do
day-by-day navigation.

## How do I opt out and keep my room from being indexed by search engines?

All public Matrix rooms are accessible to view in the Matrix Public Archive. But only
rooms with history visibility set to `world_readable` will be indexed by search engines.

Also see https://github.com/matrix-org/matrix-public-archive/issues/47

## Technical details

The main readme has an [technical overview](../README.md#technical-overview) of the
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
