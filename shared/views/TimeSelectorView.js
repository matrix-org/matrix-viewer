'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

const TOTAL_MS_IN_ONE_DAY = 24 * 60 * 60 * 1000;

function getTwentyFourHourDateStringFromDate(inputDate, preferredPrecision = 'minutes') {
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
  if (preferredPrecision === 'seconds') {
    twentyFourHourDateString += `:${formatValue(second)}`;
  }

  return twentyFourHourDateString;
}

function getLocaleTimeStringFromDate(inputDate, preferredPrecision = 'minutes') {
  const date = new Date(inputDate);

  const dateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  };

  // Prevent extra precision if it's not needed.
  // This way it will match the `<input type="time">` text/controls
  if (preferredPrecision === 'seconds') {
    dateTimeFormatOptions.second = '2-digit';
  }

  const localDateString = date.toLocaleTimeString([], dateTimeFormatOptions);

  return localDateString;
}

class TimeSelectorView extends TemplateView {
  constructor(vm) {
    super(vm);
    this._vm = vm;

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

  render(t, vm) {
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

    // TODO: Add magnifier bubble shadow around the range of messages in the timeline on
    // this page
    // const visibleRangeStartDate = todoTestDateStart;
    // const visibleRangeEndDate = todoTestDateEnd;

    // Set the scroll position
    t.mapSideEffect(
      (vm) => vm.activeDate,
      (activeDate /*, _oldActiveDate*/) => {
        // Get the timestamp from the beginning of whatever day the active day is set to
        const startOfDayTimestamp = Date.UTC(
          activeDate.getUTCFullYear(),
          activeDate.getUTCMonth(),
          activeDate.getUTCDate()
        );

        // Next, we'll find how many ms have elapsed so far in the day since the start of the day
        const msSoFarInDay = activeDate.getTime() - startOfDayTimestamp;
        const timeInDayRatio = msSoFarInDay / TOTAL_MS_IN_ONE_DAY;

        // Ignore scroll changes before the node is rendered to the page
        if (this.scrubberScrollNode) {
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
          t.input({
            type: 'time',
            value: (vm) =>
              getTwentyFourHourDateStringFromDate(vm.activeDate, vm.preferredPrecision),
            className: 'TimeSelectorView_timeInput',
            id: inputUniqueId,
          }),
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
                t.ul(
                  { className: 'TimeSelectorView_dial' },
                  hourIncrementStrings.map((hourIncrementStringData) => {
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
                  })
                ),
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

  onScroll(/*event*/) {
    const currentScrollLeft = this.scrubberScrollNode.scrollLeft;
    // Ignore scroll events caused by programmatic scroll changes by the side-effect
    // `activeDate` change.
    //
    // We don't need to recalculate the `activeDate` in the scroll handler here if we
    // programmatically changed the scroll based on the updated `activeDate` we already
    // know about.
    if (this._ignoreNextScrollEvent) {
      // Reset once we've seen a scroll event
      this._ignoreNextScrollEvent = false;
      return;
    }

    const currentScrollWidth = this.scrubberScrollNode.scrollWidth;
    const currentClientWidth = this.scrubberScrollNode.clientWidth;

    // Ratio from 0-1 of how much has been scrolled in the scrubber (0 is the start of
    // the day, 1 is the end of the day)
    const scrollRatio = currentScrollLeft / (currentScrollWidth - currentClientWidth);

    // Get the timestamp from the beginning of whatever day the active day is set to
    const startOfDayTimestamp = Date.UTC(
      this._vm.activeDate.getUTCFullYear(),
      this._vm.activeDate.getUTCMonth(),
      this._vm.activeDate.getUTCDate()
    );
    // Next, we'll derive how many ms in day are represented by that scroll position
    const msSoFarInDay = scrollRatio * TOTAL_MS_IN_ONE_DAY;

    // And craft a new date based on the scroll position
    const newActiveDate = new Date(startOfDayTimestamp + msSoFarInDay);

    console.log(
      'TODO: scroll ratio',
      (scrollRatio * 24).toFixed(2),
      scrollRatio,
      'newActiveDate',
      newActiveDate
    );
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
