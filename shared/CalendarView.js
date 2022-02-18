'use strict';

// Be mindful to do all date operations in UTC (the archive is all in UTC date/times)

const { TemplateView } = require('hydrogen-view-sdk');

function sameDay(date1, date2) {
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
}

// Month in JavaScript is 0-indexed (January is 0, February is 1, etc),
// but by using 0 as the day it will give us the last day of the prior
// month.
//
// via https://stackoverflow.com/a/1184359/796832
function numDaysInMonthForDate(date) {
  return new Date(date.getUTCFullYear(), date.getUTCMonth() + 1, 0).getUTCDate();
}

// Map from day of week to the localized name of the day
const DAYS_OF_WEEK = {
  Sun: null,
  Mon: null,
  Tue: null,
  Wed: null,
  Thu: null,
  Fri: null,
  Sat: null,
};

// Generate the localized days of the week names
const today = new Date();
for (let i = 0; i < 7; i++) {
  const lookupDate = new Date(today);
  // Date is a 1-based number
  lookupDate.setUTCDate(i + 1);

  const lookup = lookupDate.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const localized = lookupDate.toLocaleString('default', { weekday: 'short', timeZone: 'UTC' });

  DAYS_OF_WEEK[lookup] = localized;
}

class CalendarView extends TemplateView {
  render(t, vm) {
    return t.div({ className: { CalendarView: true } }, [
      t.div({ className: { CalendarView_header: true } }, [
        t.button(
          {
            className: { CalendarView_header_prevButton: true },
            onClick: () => vm.prevMonth(),
          },
          ['\u276E']
        ),
        t.map(
          (vm) => vm.calendarDate,
          (calendarDate, t) => {
            return t.h4({ className: { CalendarView_heading: true } }, [
              t.span({ className: { CalendarView_heading_text: true } }, [
                calendarDate.toLocaleString('default', {
                  year: 'numeric',
                  month: 'long',
                  timeZone: 'UTC',
                }),
                t.svg(
                  {
                    xmlns: 'http://www.w3.org/2000/svg',
                    width: '18',
                    height: '18',
                    viewBox: '0 0 18 18',
                    fill: 'none',
                  },
                  [
                    t.path({
                      d: 'M6 7.5L9 10.5L12 7.5',
                      stroke: 'currentColor',
                      'stroke-width': '1.5',
                      'stroke-linecap': 'round',
                      'stroke-linejoin': 'round',
                    }),
                  ]
                ),
              ]),

              t.input({
                type: 'month',
                className: { CalendarView_heading_monthInput: true },
                value: `${calendarDate.getUTCFullYear()}-${calendarDate.getUTCMonth() + 1}`,
                onChange: (e) => vm.onMonthInputChange(e),
              }),

              t.select(
                {
                  className: {
                    CalendarView_heading_yearSelectFallback: true,
                  },
                  onChange: (e) => vm.onYearFallbackSelectChange(e),
                },
                [].concat(
                  (() => {
                    let yearSelectNodes = [];
                    const today = new Date();
                    for (let year = today.getUTCFullYear(); year > 1960; year--) {
                      yearSelectNodes.push(
                        t.option(
                          {
                            value: year,
                            selected: year === calendarDate.getUTCFullYear(),
                          },
                          [`${year}`]
                        )
                      );
                    }

                    return yearSelectNodes;
                  })()
                )
              ),
            ]);
          }
        ),
        t.button(
          {
            className: { CalendarView_header_nextButton: true },
            onClick: () => vm.nextMonth(),
          },
          ['\u276F']
        ),
      ]),
      t.map(
        (vm) => vm.calendarDate,
        (calendarDate, t) => {
          return t.ol(
            { className: { CalendarView_calendar: true } },
            [].concat(
              Object.keys(DAYS_OF_WEEK).map((dayKey) => {
                return t.li({ className: { CalendarView_dayName: true } }, [DAYS_OF_WEEK[dayKey]]);
              }),
              (() => {
                const todayTs = Date.now();

                let dayNodes = [];
                for (let i = 0; i < numDaysInMonthForDate(calendarDate); i++) {
                  const dayNumberDate = new Date(calendarDate);
                  // Date is a 1-based number
                  dayNumberDate.setUTCDate(i + 1);
                  const isDayInFuture = dayNumberDate.getTime() - todayTs > 0;

                  // The current day displayed in the archive
                  const isActive = sameDay(dayNumberDate, vm.activeDate);

                  // day number from 0 (monday) to 6 (sunday)
                  const dayNumber = dayNumberDate.getUTCDay();

                  console.log(
                    `dayNumberDate=${dayNumberDate.getUTCDate()} (${dayNumber}) isDayInFuture=${isDayInFuture}, ${dayNumberDate.getTime()}, ${todayTs}`
                  );

                  // +1 because we're going from 0-based day to 1-based `grid-column-start`
                  const gridColumnStart = dayNumber + 1;

                  dayNodes.push(
                    t.li(
                      {
                        className: { CalendarView_day: true },
                        // Offset the first day of the month to the proper day of the week
                        style: i === 0 ? `grid-column-start: ${gridColumnStart};` : null,
                      },
                      [
                        t.a(
                          {
                            className: {
                              CalendarView_dayLink: true,
                              CalendarView_dayLink_active: isActive,
                              CalendarView_dayLink_disabled: isDayInFuture,
                            },
                            // Disable navigation to future days
                            href: isDayInFuture ? null : vm.archiveUrlForDate(dayNumberDate),
                          },
                          [String(dayNumberDate.getUTCDate())]
                        ),
                      ]
                    )
                  );
                }

                return dayNodes;
              })()
            )
          );
        }
      ),
    ]);
  }
}

module.exports = CalendarView;
