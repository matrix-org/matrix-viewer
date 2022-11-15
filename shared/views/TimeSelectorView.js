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

  // Prevent extra precision if it's not needed.
  // This way there won't be an extra time control to worry about for users in most cases.
  if (second !== 0) {
    twentyFourHourDaetString += `:${formatValue(second)}`;
  }

  return twentyFourHourDaetString;
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
  render(t, vm) {
    // Create a locally unique ID so all of the input labels correspond to only this <input>
    const inputUniqueId = `time-input-${Math.floor(Math.random() * 1000000000)}`;

    const todoTestDate = Date.UTC(2022, 2, 2, 14, 5);
    const inputDateValue = getTwentyFourHourDateStringFromDate(todoTestDate);

    const localTimeString = getLocaleTimeStringFromDate(todoTestDate);

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
        t.main({}, ['TODO: slider']),
        t.footer({ className: 'TimeSelectorView_footer' }, [
          t.label({ for: inputUniqueId }, [
            t.time(
              {
                className: 'TimeSelectorView_secondaryTime',
                datetime: new Date(todoTestDate).toISOString(),
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
}

module.exports = TimeSelectorView;
