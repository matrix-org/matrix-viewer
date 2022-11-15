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

  let twentyFourHourDaetString = `${formatValue(hour)}:${formatValue(minute)}`;

  // Keep from adding seconds if the input string doesn't have any.
  // This way there won't be an extra time control to worry about for users in most cases.
  if (second !== 0) {
    twentyFourHourDaetString += `:${formatValue(second)}`;
  }

  return twentyFourHourDaetString;
}

class TimeSelectorView extends TemplateView {
  render(t, vm) {
    // Create a locally unique ID so all of the input labels correspond to only this <input>
    const inputUniqueId = Math.floor(Math.random() * 1000000000);

    const todoTestDate = Date.UTC(2022, 2, 2, 14, 5);
    const dateValue = getTwentyFourHourDateStringFromDate(todoTestDate);

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
            value: dateValue,
            className: 'TimeSelectorView_timeInput',
            id: inputUniqueId,
          }),
        ]),
        t.main({}, ['TODO: slider']),
        t.footer({}, [
          t.label({ for: inputUniqueId }, [t.time({}, 'TODO')]),
          t.label({}, [t.span({}, 'Local Time')]),
        ]),
      ]
    );
  }
}

module.exports = TimeSelectorView;
