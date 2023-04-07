'use strict';

const assert = require('assert');

function assertSequentialNumbersStartingFromOne(numbers) {
  for (let i = 0; i < numbers.length - 1; i++) {
    assert.equal(
      numbers[i],
      i,
      `Expected numbers to be sequential starting from 1 but saw ${numbers[i]} at index ${i} from ${numbers}`
    );
  }
}

function findEventRangeFromBracketPairsInLine({ inputLine, regexPattern, eventLine }) {
  assert(inputLine);
  assert(regexPattern);
  assert(eventLine);

  const stringIndiciceToEventMap = new Map();
  eventLine.replace(/\d+/g, (match, offset /*, string, groups*/) => {
    const eventNumber = match;
    stringIndiciceToEventMap[offset] = eventNumber;
  });
  // Ensure the person defined the events in order
  assertSequentialNumbersStartingFromOne(stringIndiciceToEventMap.values());

  // Numbers can be multiple digits long. In order to lookup the eventNumber by the
  // position of the closing bracket, we need to construct a map from the string index
  // at the end of given eventNumber to the eventNumber.
  //
  // ex.
  // ... <-- 8 <-- 9 <-- 10 <-- 11 <-- 12
  // [day1                              ]
  const stringIndiceNumberEndToEventMap = new Map();
  stringIndiciceToEventMap.entries().forEach(([stringIndiceNumber, eventNumber]) => {
    stringIndiceNumberEndToEventMap.set(stringIndiceNumber + eventNumber.length, eventNumber);
  });

  const matchMap = new Map();
  inputLine.replace(regexPattern, (match, numberLabel, offset /*, string, groups*/) => {
    const startEventIndice = offset;
    const endEventIndice = offset + match.length;

    const startEvent = stringIndiciceToEventMap[startEventIndice];
    const endEvent = stringIndiceNumberEndToEventMap[endEventIndice];
    assert(
      startEvent,
      `For match ${numberLabel}, the opening bracket does not line up exactly with an event in the eventLine:\n` +
        `${eventLine}\n` +
        `${inputLine}`
    );
    assert(
      endEvent,
      `For match ${numberLabel}, the closing bracket does not line up exactly with an event in the eventLine:\n` +
        `${eventLine}\n` +
        `${inputLine}`
    );
    assert(
      endEvent > startEvent,
      `For match ${numberLabel}, expected endEvent ${endEvent} to be greater than startEvent ${startEvent}`
    );

    matchMap.set(numberLabel, {
      startEvent,
      endEvent,
    });
  });

  return matchMap;
}

// Used in tests to parse a string that defines the structure of a room and the events
// in that room.
//
// ```
// const EXAMPLE_ROOM_DAY_MESSAGE_STRUCTURE_STRING = `
// [room1            ]     [room2                                       ]
// 1 <-- 2 <-- 3 <-- 4 <-- 5 <-- 6 <-- 7 <-- 8 <-- 9 <-- 10 <-- 11 <-- 12
// [day1                         ]     [day2                            ]
//       [page1                  ]
//                               |--jump-fwd-4-messages-->|
//                         [page2                  ]
// `;
// ```
function parseRoomDayMessageStructure(roomDayMessageStructureString) {
  assert(roomDayMessageStructureString && roomDayMessageStructureString.length > 0);

  // Strip the leading whitespace from each line
  const rawLines = roomDayMessageStructureString.split(/\\r?\\n/);
  const numWhiteSpaceToStripFromEachLine = rawLines[0].match(/^\s*/)[0].length;
  const lines = rawLines
    .map((line) => line.slice(numWhiteSpaceToStripFromEachLine))
    .filter((line) => {
      return line.length > 0;
    });
  const roomLine = lines[0];
  const eventLine = lines[1];
  const dayLine = lines[2];
  const pageLines = lines.filter((line) => line.match(/\[page\d+\s*\]/));

  const dayToEventRangeMap = findEventRangeFromBracketPairsInLine({
    inputLine: dayLine,
    regexPattern: /\[day(\d+)\s*\]/g,
    eventLine,
  });
  // Ensure the person defined the days in order
  assertSequentialNumbersStartingFromOne(dayToEventRangeMap.keys());
  // Make a map so it's easier to lookup which day an event is in
  const eventToDayMap = new Map();
  dayToEventRangeMap.forEach(({ startEvent, endEvent }, dayNumber) => {
    for (let eventNumber = startEvent; eventNumber <= endEvent; eventNumber++) {
      eventToDayMap.set(eventNumber, dayNumber);
    }
  });

  const roomToEventRangeMap = findEventRangeFromBracketPairsInLine({
    inputLine: roomLine,
    regexPattern: /\[room(\d+)\s*\]/g,
    eventLine,
  });
  // Ensure the person defined the rooms in order
  assertSequentialNumbersStartingFromOne(roomToEventRangeMap.keys());

  function getEventMetaFromEventNumber(eventNumber) {
    const dayNumber = eventToDayMap.get(eventNumber);
    const eventRangeInDay = dayToEventRangeMap.get(dayNumber);
    const event = {
      eventNumber,
      eventIndexInDay: eventNumber - eventRangeInDay.startEvent,
      dayNumber,
    };
    return event;
  }

  // Get a list of events that should be in each room
  const rooms = roomToEventRangeMap.keys().map((roomNumber) => {
    const { startEvent, endEvent } = roomToEventRangeMap.get(roomNumber);
    const events = [];
    for (let eventNumber = startEvent; eventNumber <= endEvent; eventNumber++) {
      events.push(getEventMetaFromEventNumber(eventNumber));
    }

    return {
      events,
    };
  });

  // Get a list of events that should be displayed on each page
  const pages = pageLines.forEach((pageLine) => {
    const pageToEventRangeMap = findEventRangeFromBracketPairsInLine({
      inputLine: pageLine,
      regexPattern: /\[page(\d+)\s*\]/g,
      eventLine,
    });
    assert(
      pageToEventRangeMap.size === 1,
      `Expected to find exactly one page in line "${pageLine}" (found ${pageToEventRangeMap.size}). ` +
        `Because pages can overlap on the events they display, they should be on their own lines`
    );

    const { startEvent, endEvent } = Array.from(pageToEventRangeMap.values())[0];

    const events = [];
    for (let eventNumber = startEvent; eventNumber <= endEvent; eventNumber++) {
      events.push(getEventMetaFromEventNumber(eventNumber));
    }

    return {
      events,
    };
  });
  // Ensure that each page has the same number of events on it
  const numEventsOnEachPage = pages.map((page) => page.events.length);
  const archiveMessageLimit = numEventsOnEachPage[0];
  assert(
    numEventsOnEachPage.every((numEvents) => numEvents === archiveMessageLimit),
    `Expected all pages to have the same number of events but found ${numEventsOnEachPage}`
  );

  return {
    rooms,
    archiveMessageLimit,
    pages,
  };
}

module.exports = parseRoomDayMessageStructure;
