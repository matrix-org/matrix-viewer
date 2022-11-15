'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

function getTwentyFourHourDateStringFromDate(inputDate) {
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
  if (second !== 0) {
    twentyFourHourDateString += `:${formatValue(second)}`;
  }

  return twentyFourHourDateString;
}

function getLocaleTimeStringFromDate(inputDate) {
  const date = new Date(inputDate);

  const dateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  };

  // Prevent extra precision if it's not needed.
  // This way it will match the `<input type="time">` text/controls
  if (date.getUTCSeconds() !== 0) {
    dateTimeFormatOptions.second = '2-digit';
  }

  const localDateString = date.toLocaleTimeString([], dateTimeFormatOptions);

  return localDateString;
}

class TimeSelectorView extends TemplateView {
  constructor(vm) {
    super(vm);
    this._vm = vm;
  }

  render(t, vm) {
    // Create a locally unique ID so all of the input labels correspond to only this <input>
    const inputUniqueId = `time-input-${Math.floor(Math.random() * 1000000000)}`;

    const todoTestDateStart = Date.UTC(2022, 2, 2, 14, 5);
    const todoTestDateEnd = Date.UTC(2022, 2, 2, 16, 17);
    const inputDateValue = getTwentyFourHourDateStringFromDate(todoTestDateStart);

    const localTimeString = getLocaleTimeStringFromDate(todoTestDateStart);

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
    const visibleRangeStartDate = todoTestDateStart;
    const visibleRangeEndDate = todoTestDateEnd;

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
            value: inputDateValue,
            className: 'TimeSelectorView_timeInput',
            id: inputUniqueId,
          }),
        ]),
        t.main({ className: 'TimeSelectorView_scrubber' }, [
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
        ]),
        t.footer({ className: 'TimeSelectorView_footer' }, [
          t.label({ for: inputUniqueId }, [
            t.time(
              {
                className: 'TimeSelectorView_secondaryTime',
                datetime: new Date(todoTestDateStart).toISOString(),
              },
              localTimeString
            ),
          ]),
          t.label({ for: inputUniqueId }, [
            t.span({ className: 'TimeSelectorView_secondaryTimezoneLabel' }, 'Local Time'),
          ]),
        ]),
      ]
    );
  }

  get scrubberNode() {
    return this.root().querySelector('.js-scrubber');
  }

  onScroll(/*event*/) {
    const currentScrollLeft = this.scrubberNode.scrollLeft;
    const currentScrollWidth = this.scrubberNode.scrollWidth;
    const currentClientWidth = this.scrubberNode.clientWidth;

    // Ratio from 0-1 of how complete
    const scrollRatio = currentScrollLeft / (currentScrollWidth - currentClientWidth);

    console.log('TODO: scroll ratio', (scrollRatio * 24).toFixed(2), scrollRatio);
  }

  onMousedown(event) {
    this._vm.setIsDragging(true);
    this._vm.setDragPositionX(event.pageX);
  }

  onMouseup(/*event*/) {
    this._vm.setIsDragging(false);
    this.startMomentumTracking();
  }

  onMousemove(event) {
    if (this._vm.isDragging) {
      const delta = event.pageX - this._vm.dragPositionX;

      this.scrubberNode.scrollLeft = this.scrubberNode.scrollLeft - delta;
      // Ignore momentum for delta's of 1px or below because slowly moving by 1px
      // shouldn't really have momentum. Imagine you're trying to precisely move to a
      // spot, you don't want it to move again after you let go.
      this._vm.setVelocityX(Math.abs(delta) > 1 ? delta : 0);

      this._vm.setDragPositionX(event.pageX);
    }
  }

  onMouseleave(/*event*/) {
    this._vm.setIsDragging(false);
  }

  onWheel(/*event*/) {
    this._vm.setVelocityX(0);
    this.cancelMomentumTracking();
  }

  startMomentumTracking() {
    this.cancelMomentumTracking();
    const momentumRafId = requestAnimationFrame(this.momentumLoop.bind(this));
    this._vm.setMomentumRafId(momentumRafId);
  }

  cancelMomentumTracking() {
    cancelAnimationFrame(this._vm.momentumRafId);
  }

  momentumLoop() {
    const velocityXAtStartOfLoop = this._vm.velocityX;
    // Apply the momentum movement to the scroll
    this.scrubberNode.scrollLeft -= velocityXAtStartOfLoop * 2;

    const DAMPING_FACTOR = 0.95;
    const DEADZONE = 0.5;

    // Scrub off some momentum each run of the loop (friction)
    const newVelocityX = velocityXAtStartOfLoop * DAMPING_FACTOR;
    if (Math.abs(newVelocityX) > DEADZONE) {
      const momentumRafId = requestAnimationFrame(this.momentumLoop.bind(this));
      this._vm.setMomentumRafId(momentumRafId);
    }

    this._vm.setVelocityX(newVelocityX);
  }
}

module.exports = TimeSelectorView;
