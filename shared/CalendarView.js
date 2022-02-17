'use strict';

const { TemplateView } = require('hydrogen-view-sdk');

function sameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// Month in JavaScript is 0-indexed (January is 0, February is 1, etc),
// but by using 0 as the day it will give us the last day of the prior
// month.
//
// via https://stackoverflow.com/a/1184359/796832
function numDaysInMonthForDate(date) {
  return new Date(date.getYear(), date.getMonth() + 1, 0).getDate();
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
  lookupDate.setDate(i + 1);

  const lookup = lookupDate.toLocaleString('en-US', { weekday: 'short' });
  const localized = lookupDate.toLocaleString('default', { weekday: 'short' });

  DAYS_OF_WEEK[lookup] = localized;
}

class CalendarView extends TemplateView {
  render(t, vm) {
    return t.div({ className: { CalendarView: true } }, [
      t.div({ className: { CalendarView_heading: true } }, [
        t.button(
          {
            className: { CalendarView_heading_prevButton: true },
            onClick: () => vm.prevMonth(),
          },
          ['\u276E']
        ),
        t.map(
          (vm) => vm.calendarDate,
          (date, t) => {
            return t.h4({ className: { CalendarView_heading_text: true } }, [
              date.toLocaleString('default', { year: 'numeric', month: 'long' }),
            ]);
          }
        ),
        t.button(
          {
            className: { CalendarView_heading_nextButton: true },
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
                  dayNumberDate.setDate(i);
                  const isDayInFuture = dayNumberDate.getTime() - todayTs > 0;

                  // The current day displayed in the archive
                  const isActive = sameDay(dayNumberDate, vm.activeDate);

                  // day number from 0 (monday) to 6 (sunday)
                  const dayNumber = dayNumberDate.getDay();

                  // +1 because we're going from 0-based day to 1-based `grid-column-start`
                  // +1 because we actually start the week on Sunday(6) instead of Monday(0)
                  const gridColumnStart = dayNumber + 1 + 1;

                  dayNodes.push(
                    t.li(
                      {
                        className: { CalendarView_day: true },
                        style: i === 0 ? `grid-column-start: ${gridColumnStart};` : null,
                      },
                      [
                        t.a(
                          {
                            className: {
                              CalendarView_dayLink: true,
                              CalendarView_dayLink_active: isActive,
                            },
                            // Disable navigation to future days
                            href: isDayInFuture ? null : vm.linkForDate(dayNumberDate),
                          },
                          [String(i + 1)]
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
