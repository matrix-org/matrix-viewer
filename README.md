# Matrix public archive

**NB: This project is very much a work-in-progress (WIP)!** Undocumented
config/secrets, using a draft branch of Hydrogen, etc.

In the vein of [feature parity with
Gitter](https://github.com/vector-im/roadmap/issues/26), the goal is to make a
public archive site like Gitter's archives which search engines can index and
keep all of the content accessible/available. There is already
https://view.matrix.org/ (https://github.com/matrix-org/matrix-static) but there
is some desire to make something with more Element-feeling polish and loading
faster (avoid the slow 502's errors that are frequent on `view.matrix.org`).

## Plan summary

The plan is to server-side render (SSR) the
[Hydrogen](https://github.com/vector-im/hydrogen-web) Matrix client on a Node.js
server (since both use JavaScript) and serve pages on the fly (probably with
some Cloudflare caching on top) when someone requests
`/archives/${year}/${month}/${day}`. To fetch the events for a given day/time,
we will use [MSC3030](https://github.com/matrix-org/matrix-doc/pull/3030)'s
`/timestamp_to_event` endpoint to jump to a given day in the timeline and fetch
the messages from a Matrix homeserver.

Re-using Hydrogen gets us pretty and native(to Element) looking styles and keeps
the maintenance burden of supporting more event types in Hydrogen.
