'use strict';

const assert = require('matrix-public-archive-shared/lib/assert');
const { TemplateView } = require('hydrogen-view-sdk');
const {
  MS_LOOKUP,
  TIME_PRECISION_VALUES,
} = require('matrix-public-archive-shared/lib/reference-values');
const { ONE_DAY_IN_MS, ONE_HOUR_IN_MS, ONE_MINUTE_IN_MS, ONE_SECOND_IN_MS } = MS_LOOKUP;
const { getUtcStartOfDayTs } = require('matrix-public-archive-shared/lib/timestamp-utilities');

function clamp(input, min, max) {
  assert(input !== undefined);
  assert(min !== undefined);
  assert(max !== undefined);
  return Math.min(Math.max(input, min), max);
}

function getTwentyFourHourTimeStringFromDate(
  inputDate,
  preferredPrecision = TIME_PRECISION_VALUES.minutes
) {
  const date = new Date(inputDate);

  const formatValue = (input) => {
    return String(input).padStart(2, '0');
  };

  // getUTCHours() returns an integer between 0 and 23
  const hour = date.getUTCHours();

  // getUTCHours() returns an integer between 0 and 59
  const minute = date.getUTCMinutes();

  // getUTCSeconds() returns an integer between 0 and 59
  const second = date.getUTCSeconds();

  let twentyFourHourDateString = `${formatValue(hour)}:${formatValue(minute)}`;

  // Prevent extra precision if it's not needed.
  // This way there won't be an extra time control to worry about for users in most cases.
  if (preferredPrecision === TIME_PRECISION_VALUES.seconds) {
    twentyFourHourDateString += `:${formatValue(second)}`;
  }

  return twentyFourHourDateString;
}

function getLocaleTimeStringFromDate(
  inputDate,
  preferredPrecision = TIME_PRECISION_VALUES.minutes
) {
  const date = new Date(inputDate);

  const dateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  };

  // Prevent extra precision if it's not needed.
  // This way it will match the `<input type="time">` text/controls
  if (preferredPrecision === TIME_PRECISION_VALUES.seconds) {
    dateTimeFormatOptions.second = '2-digit';
  }

  const localDateString = date.toLocaleTimeString([], dateTimeFormatOptions);

  return localDateString;
}

class TimeSelectorView extends TemplateView {
  constructor(vm) {
    super(vm);
    this._vm = vm;

    // Keep track of the `IntersectionObserver` so we can disconnect it when necessary
    this._interSectionObserverForVisibility = null;
    // Keep track of the position we started dragging from so we can derive the delta movement
    this._dragPositionX = null;
    // Keep track of the momentum velocity over time
    this._velocityX = 0;
    // Keep track of the requestAnimationFrame(...) ID so we can cancel it when necessary
    this._momentumRafId = null;
    // Keep track of when we should ignore scroll events from programmatic scroll
    // position changes from the side-effect `activeDate` change. The scroll event
    // handler is only meant to capture the user changing the scroll and therefore a new
    // `activeDate` should be calculated.
    this._ignoreNextScrollEvent = false;
  }

  unmount() {
    if (this._interSectionObserverForVisibility) {
      this._interSectionObserverForVisibility.disconnect();
    }

    if (this._momentumRafId) {
      cancelAnimationFrame(this._momentumRafId);
    }
  }

  render(t /*, vm*/) {
    // Create a locally unique ID so all of the input labels correspond to only this <input>
    const inputUniqueId = `time-input-${Math.floor(Math.random() * 1000000000)}`;

    const hourIncrementStrings = [...Array(24).keys()].map((hourNumber) => {
      return {
        utc: new Date(Date.UTC(2022, 1, 1, hourNumber)).toLocaleTimeString([], {
          hour: 'numeric',
          timeZone: 'UTC',
        }),
        local: new Date(Date.UTC(2022, 1, 1, hourNumber)).toLocaleTimeString([], {
          hour: 'numeric',
        }),
      };
    });

    // Set the scroll position based on the `activeDate` whenever it changes
    t.mapSideEffect(
      (vm) => vm.activeDate,
      (/*activeDate , _oldActiveDate*/) => {
        // This makes the side-effect always run after the initial `render` and after
        // bindings evaluate.
        //
        // For the initial render, this does assume this view will be mounted in the
        // parent DOM straight away. #hydrogen-assume-view-mounted-right-away -
        // https://github.com/vector-im/hydrogen-web/issues/1069
        requestAnimationFrame(() => {
          this.updateScrubberScrollBasedOnActiveDate();
        });
      }
    );

    // Avoid an error when server-side rendering (SSR) because it doesn't have all the
    // DOM API's available (and doesn't need it for this case)
    if (typeof IntersectionObserver === 'function') {
      // Since this lives in the right-panel which is conditionally hidden from view with
      // `display: none;`, we have to re-evaluate the scrubber scroll position when it
      // becomes visible because client dimensions evaluate to `0` when something is
      // hidden in the DOM.
      t.mapSideEffect(
        // We do this so it only runs once. We only need to run this once to bind the
        // `IntersectionObserver`
        (/*vm*/) => null,
        () => {
          // This makes the side-effect always run after the initial `render` and after
          // bindings evaluate.
          //
          // For the initial render, this does assume this view will be mounted in the
          // parent DOM straight away. #hydrogen-assume-view-mounted-right-away -
          // https://github.com/vector-im/hydrogen-web/issues/1069
          requestAnimationFrame(() => {
            // Bind IntersectionObserver to the target element
            this._interSectionObserverForVisibility = new IntersectionObserver((entries) => {
              const isScrubberVisible = entries[0].isIntersecting;
              if (isScrubberVisible) {
                this.updateScrubberScrollBasedOnActiveDate();
              }
            });
            this._interSectionObserverForVisibility.observe(this.scrubberScrollNode);
          });
        }
      );
    }

    const timeInput = t.input({
      type: 'time',
      value: (vm) => getTwentyFourHourTimeStringFromDate(vm.activeDate, vm.preferredPrecision),
      step: (vm) => {
        // `step="1"` is a "hack" to get the time selector to always show second precision
        if (vm.preferredPrecision === TIME_PRECISION_VALUES.seconds) {
          return 1;
        }

        return undefined;
      },
      onChange: (e) => {
        this.onTimeInputChange(e);
      },
      className: 'TimeSelectorView_timeInput',
      id: inputUniqueId,
    });

    // Set the time input `.value` property
    t.mapSideEffect(
      (vm) => vm.activeDate,
      (activeDate /*, _oldActiveDate*/) => {
        const newValue = getTwentyFourHourTimeStringFromDate(
          activeDate,
          this._vm.preferredPrecision
        );
        // Ideally, the input would reflect whatever the `value` attribute was set as in
        // the DOM. But it seems to ignore the attribute after using the time input to
        // select a time. We have to manually set the `.value` property of the input in
        // order for it to actually reflect the value in the UI.
        timeInput.value = newValue;
      }
    );

    return t.section(
      {
        className: {
          TimeSelectorView: true,
        },
        'data-testid': 'time-selector',
      },
      [
        t.header({ className: 'TimeSelectorView_header' }, [
          t.label({ for: inputUniqueId }, [
            t.span({ className: 'TimeSelectorView_primaryTimezoneLabel' }, 'UTC +0'),
          ]),
          timeInput,
          t.a(
            {
              className: 'TimeSelectorView_goAction',
              href: (vm) => vm.goToActiveDateUrl,
            },
            'Go'
          ),
        ]),
        t.main(
          {
            className: 'TimeSelectorView_scrubber',
            // We'll hide this away for screen reader users because they should use the
            // native `<input>` instead of this weird scrolling time scrubber thing
            'aria-hidden': true,
          },
          [
            t.div(
              {
                className: {
                  TimeSelectorView_scrubberScrollWrapper: true,
                  'is-dragging': (vm) => vm.isDragging,
                  'js-scrubber': true,
                },
                // Emulate momentum scrolling for mouse click and dragging. Still allows
                // for native momentum scrolling on touch devices because those don't
                // trigger mouse events.
                onMousedown: (event) => {
                  this.onMousedown(event);
                },
                onMouseup: (event) => {
                  this.onMouseup(event);
                },
                onMousemove: (event) => {
                  this.onMousemove(event);
                },
                onMouseleave: (event) => {
                  this.onMouseleave(event);
                },
                onWheel: (event) => {
                  this.onWheel(event);
                },
                onScroll: (event) => {
                  this.onScroll(event);
                },
              },
              [
                t.ul({ className: 'TimeSelectorView_dial' }, [
                  ...hourIncrementStrings.map((hourIncrementStringData) => {
                    return t.li({ className: 'TimeSelectorView_incrementLabel' }, [
                      t.div(
                        { className: 'TimeSelectorView_incrementLabelText' },
                        hourIncrementStringData.utc
                      ),
                      t.div(
                        { className: 'TimeSelectorView_incrementLabelTextSecondary' },
                        hourIncrementStringData.local
                      ),
                    ]);
                  }),

                  // The magnifier highlights the time range of messages in the timeline on this page
                  t.map(
                    // This is just a trick to get this element to update whenever either of these values change (not fool-proof)
                    (vm) => vm.timelineRangeStartTimestamp + vm.timelineRangeEndTimestamp,
                    (_value, t /*, vm*/) => {
                      return t.div({
                        className: 'TimeSelectorView_magnifierBubble',
                        style: (vm) => {
                          const msInRange =
                            vm.timelineRangeEndTimestamp - vm.timelineRangeStartTimestamp;

                          // No messages in the timeline, means nothing to highlight
                          if (!msInRange) {
                            return 'display: none;';
                          }
                          // If the timeline has messages from more than one day, then
                          // just just hide it and log a warning. There is no point in
                          // highlighting the whole range of time.
                          else if (msInRange > ONE_DAY_IN_MS) {
                            console.warn(
                              'Timeline has messages from more than one day but TimeSelectorView is being used. We only expect to show the TimeSelectorView when there is less than a day of messages.'
                            );
                            return 'display: none;';
                          }

                          // Get the timestamp from the beginning of whatever day the active day is set to
                          const startOfDayTimestamp = getUtcStartOfDayTs(this._vm.activeDate);

                          const widthRatio = msInRange / ONE_DAY_IN_MS;
                          const msFromStartOfDay =
                            vm.timelineRangeStartTimestamp - startOfDayTimestamp;
                          const leftPositionRatio = msFromStartOfDay / ONE_DAY_IN_MS;

                          return `width: ${100 * widthRatio}%; left: ${100 * leftPositionRatio}%;`;
                        },
                      });
                    }
                  ),
                ]),
              ]
            ),
          ]
        ),
        t.footer({ className: 'TimeSelectorView_footer' }, [
          t.label({ for: inputUniqueId }, [
            t.time(
              {
                className: 'TimeSelectorView_secondaryTime',
                datetime: (vm) => new Date(vm.activeDate).toISOString(),
              },
              t.map(
                (vm) => vm.activeDate,
                (_activeDate, t, vm) => {
                  return t.span(getLocaleTimeStringFromDate(vm.activeDate, vm.preferredPrecision));
                }
              )
            ),
          ]),
          t.label({ for: inputUniqueId }, [
            t.span({ className: 'TimeSelectorView_secondaryTimezoneLabel' }, 'Local Time'),
          ]),
        ]),
      ]
    );
  }

  get scrubberScrollNode() {
    if (!this._scrubberScrollNode) {
      this._scrubberScrollNode = this.root()?.querySelector('.js-scrubber');
    }

    return this._scrubberScrollNode;
  }

  onTimeInputChange(event) {
    const prevActiveDate = this._vm.activeDate;

    const newTimeString = event.target.value;
    if (newTimeString) {
      const [hourString, minuteString, secondString = '0'] = newTimeString.split(':');
      const hourInMs = parseInt(hourString, 10) * ONE_HOUR_IN_MS;
      const minuteInMs = parseInt(minuteString, 10) * ONE_MINUTE_IN_MS;
      const secondInMs = parseInt(secondString, 10) * ONE_SECOND_IN_MS;
      const timeInMs = hourInMs + minuteInMs + secondInMs;

      // Get the timestamp from the beginning of whatever day the active day is set to
      const startOfDayTimestamp = getUtcStartOfDayTs(prevActiveDate);

      const newActiveDate = new Date(startOfDayTimestamp + timeInMs);
      this._vm.setActiveDate(newActiveDate);
    }
  }

  // Set the scrubber scroll position based on the `activeDate`
  updateScrubberScrollBasedOnActiveDate() {
    const activeDate = this._vm.activeDate;

    // Get the timestamp from the beginning of whatever day the active day is set to
    const startOfDayTimestamp = getUtcStartOfDayTs(activeDate);

    // Next, we'll find how many ms have elapsed so far in the day since the start of the day
    const msSoFarInDay = activeDate.getTime() - startOfDayTimestamp;
    const timeInDayRatio = msSoFarInDay / ONE_DAY_IN_MS;

    // Ignore scroll changes before the node is rendered to the page
    if (this.scrubberScrollNode) {
      // These will evaluate to `0` if this is `display: none;` which happens on
      // mobile when the right-panel is hidden.
      const currentScrollWidth = this.scrubberScrollNode.scrollWidth;
      const currentClientWidth = this.scrubberScrollNode.clientWidth;

      // Change the scroll position to the represented date
      this.scrubberScrollNode.scrollLeft =
        timeInDayRatio * (currentScrollWidth - currentClientWidth);

      // We can't just keep track of the `scrollLeft` position and compare it in the
      // scroll event handler because there are rounding differences (Chrome rounds
      // any decimal down). `scrollLeft` normally rounds down to integers but gets
      // wonky once you introduce display scaling and will give decimal values. And
      // we don't want to lookup `scrollLeft` from the element after we just set it
      // because that will cause a layout recalculation (thrashing) which isn't
      // performant.
      //
      // So instead, we rely on ignoring the next scroll event that will be fired
      // from scroll change just above. We know that all of the DOM event stuff all
      // happens in the main thread so should be no races there and assume that
      // there are not other changes to the scroll in this same loop.
      this._ignoreNextScrollEvent = true;
    }
  }

  onScroll(/*event*/) {
    const currentScrollLeft = this.scrubberScrollNode.scrollLeft;
    // Ignore scroll events caused by programmatic scroll position changes by the
    // side-effect `activeDate` change handler.
    //
    // We don't need to recalculate the `activeDate` in the scroll handler here if we
    // programmatically changed the scroll based on the updated `activeDate` we already
    // know about.
    if (this._ignoreNextScrollEvent) {
      // Reset once we've seen a scroll event
      this._ignoreNextScrollEvent = false;
      return;
    }

    // The width of content in the time selector scrubber
    const currentScrollWidth = this.scrubberScrollNode.scrollWidth;
    // The width of time selector that we can see
    const currentClientWidth = this.scrubberScrollNode.clientWidth;

    // Ratio from 0-1 of how much has been scrolled in the scrubber (0 is the start of
    // the day, 1 is the end of the day). We clamp to protect from people overscrolling
    // in either direction and accidately advancing to the next/previous day.
    const scrollRatio = clamp(currentScrollLeft / (currentScrollWidth - currentClientWidth), 0, 1);

    // Next, we'll derive how many ms in the day are represented by that scroll
    // position.
    //
    // We use a `clamp` instead of `scrollRatio * (ONE_DAY_IN_MS - 1)` to avoid every
    // position we move to having 59 seconds (`03:25:59`) as the result. The math works
    // out that way because there is exactly 60 pixels between each hour in the time
    // selector and there are 60 minutes in an hour so we always get back minute
    // increments.
    const msSoFarInDay = clamp(
      scrollRatio * ONE_DAY_IN_MS,
      0,
      // We `- 1` from `ONE_DAY_IN_MS` because we don't want to accidenatally
      // advance to the next day at the extremity because midnight + 24 hours = the next
      // day instead of the same day.
      ONE_DAY_IN_MS - 1
    );

    // Get the timestamp from the beginning of whatever day the active day is set to
    const startOfDayTimestamp = getUtcStartOfDayTs(this._vm.activeDate);

    // And craft a new date based on the scroll position
    const newActiveDate = new Date(startOfDayTimestamp + msSoFarInDay);
    this._vm.setActiveDate(newActiveDate);
  }

  onMousedown(event) {
    this._vm.setIsDragging(true);
    this._dragPositionX = event.pageX;
  }

  onMouseup(/*event*/) {
    this._vm.setIsDragging(false);
    this.startMomentumTracking();
  }

  onMousemove(event) {
    if (this._vm.isDragging) {
      const delta = event.pageX - this._dragPositionX;

      this.scrubberScrollNode.scrollLeft = this.scrubberScrollNode.scrollLeft - delta;
      // Ignore momentum for delta's of 1px or below because slowly moving by 1px
      // shouldn't really have momentum. Imagine you're trying to precisely move to a
      // spot, you don't want it to move again after you let go.
      this._velocityX = Math.abs(delta) > 1 ? delta : 0;

      this._dragPositionX = event.pageX;
    }
  }

  onMouseleave(/*event*/) {
    this._vm.setIsDragging(false);
  }

  onWheel(/*event*/) {
    this._velocityX = 0;
    // If someone is using the horizontal mouse wheel, they already know what they're
    // doing. Don't mess with it.
    this.cancelMomentumTracking();
  }

  startMomentumTracking() {
    this.cancelMomentumTracking();
    const momentumRafId = requestAnimationFrame(this.momentumLoop.bind(this));
    this._momentumRafId = momentumRafId;
  }

  cancelMomentumTracking() {
    cancelAnimationFrame(this._momentumRafId);
  }

  momentumLoop() {
    const velocityXAtStartOfLoop = this._velocityX;
    // Apply the momentum movement to the scroll
    const currentScrollLeft = this.scrubberScrollNode.scrollLeft;
    const newScrollLeftPosition = currentScrollLeft - velocityXAtStartOfLoop * 2;
    this.scrubberScrollNode.scrollLeft = newScrollLeftPosition;

    const DAMPING_FACTOR = 0.95;
    const DEADZONE = 0.5;

    // Scrub off some momentum each run of the loop (friction)
    const newVelocityX = velocityXAtStartOfLoop * DAMPING_FACTOR;
    if (Math.abs(newVelocityX) > DEADZONE) {
      const momentumRafId = requestAnimationFrame(this.momentumLoop.bind(this));
      this._momentumRafId = momentumRafId;
    }

    this._velocityX = newVelocityX;
  }
}

module.exports = TimeSelectorView;
