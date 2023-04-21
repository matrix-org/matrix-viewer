import assert from 'assert';

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
    stringIndiciceToEventMap.set(offset, parseInt(eventNumber, 10));
  });
  assert(stringIndiciceToEventMap.size > 0, `Expected to find at least one event in ${eventLine}`);
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
  Array.from(stringIndiciceToEventMap.entries()).forEach(([stringIndiceNumber, eventNumber]) => {
    stringIndiceNumberEndToEventMap.set(
      stringIndiceNumber + String(eventNumber).length,
      eventNumber
    );
  });

  const matchMap = new Map();
  inputLine.replace(regexPattern, (match, numberLabel, offset /*, string, groups*/) => {
    const startEventIndice = offset;
    const endEventIndice = offset + match.length;

    const startEventNumber = stringIndiciceToEventMap.get(startEventIndice);
    const endEventNumber = stringIndiceNumberEndToEventMap.get(endEventIndice);
    assert(
      startEventNumber,
      `For match ${numberLabel}, the opening bracket does not line up exactly with an event in the eventLine:\n` +
        `${eventLine}\n` +
        `${inputLine}\n` +
        `Looking for event at startEventIndice=${startEventIndice} in ${JSON.stringify(
          Object.fromEntries(stringIndiciceToEventMap.entries())
        )}`
    );
    assert(
      endEventNumber,
      `For match ${numberLabel}, the closing bracket does not line up exactly with an event in the eventLine:\n` +
        `${eventLine}\n` +
        `${inputLine}\n` +
        `Looking for event at endEventIndice=${endEventIndice} in ${JSON.stringify(
          Object.fromEntries(stringIndiceNumberEndToEventMap.entries())
        )}`
    );
    assert(
      endEventNumber > startEventNumber,
      `For match ${numberLabel}, expected endEventNumber=${endEventNumber} to be greater than startEventNumber=${startEventNumber}`
    );

    matchMap.set(numberLabel, {
      startEventNumber,
      endEventNumber,
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
  const rawLines = roomDayMessageStructureString.split(/\r?\n/);
  // We choose the second line because the first line is likely to be empty
  const numWhiteSpaceToStripFromEachLine = rawLines[1].match(/^\s*/)[0].length;
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
  dayToEventRangeMap.forEach(({ startEventNumber, endEventNumber }, dayNumber) => {
    for (let eventNumber = startEventNumber; eventNumber <= endEventNumber; eventNumber++) {
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
    assert(
      dayNumber,
      `Could not find event${eventNumber} associated with any day (check the brackets for "[dayX   ]" to make sure it encompasses that event)\n` +
        `${eventLine}\n` +
        `${dayLine}\n` +
        `eventToDayMap=${JSON.stringify(Object.fromEntries(eventToDayMap.entries()))}`
    );
    const eventRangeInDay = dayToEventRangeMap.get(dayNumber);
    const event = {
      eventNumber,
      eventIndexInDay: eventNumber - eventRangeInDay.startEventNumber,
      dayNumber,
    };
    return event;
  }

  // Get a list of events that should be in each room
  const rooms = Array.from(roomToEventRangeMap.keys()).map((roomNumber) => {
    const { startEventNumber, endEventNumber } = roomToEventRangeMap.get(roomNumber);
    const events = [];
    for (let eventNumber = startEventNumber; eventNumber <= endEventNumber; eventNumber++) {
      events.push(getEventMetaFromEventNumber(eventNumber));
    }

    return {
      events,
    };
  });

  // Get a list of events that should be displayed on each page
  const pages = pageLines.map((pageLine, index) => {
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

    // Ensure the person defined the pages in order
    assert(Array.from(pageToEventRangeMap.keys())[0], index + 1);

    const { startEventNumber, endEventNumber } = Array.from(pageToEventRangeMap.values())[0];

    const events = [];
    for (let eventNumber = startEventNumber; eventNumber <= endEventNumber; eventNumber++) {
      events.push(getEventMetaFromEventNumber(eventNumber));
    }

    return {
      events,
    };
  });

  return {
    rooms,
    pages,
  };
}

module.exports = parseRoomDayMessageStructure;
