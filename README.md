# IcsWhy
Paste the text of an .ics file: events in plain words, time kind (all-day, UTC, TZID, floating), and import problems. Static client-side app, open `app.html`.
Sources: RFC 5545 fetched (about 50 KB, the start of the document). I did not read the sections on content lines, TEXT escaping or DTEND semantics from that text; those rules (75-octet folding, `\\ \; \, \n`, exclusive all-day DTEND, required UID/DTSTAMP/DTSTART) are from memory and the tests below.
Tests: `node test-engine.js` compares event text, start and end (with time kind) to Python `icalendar` 7.3.0 (`oracle.py`) on 1500 generated calendars, 3034 events, 15,170 field comparisons, 0 differences, plus 3 known-bad files that must trigger the right warning.
Not checked: the warnings against Google, Apple or Outlook, VTIMEZONE offsets, RRULE, ATTENDEE, VALARM. Time zone names are not validated.
Note: the app passes `{pasted:true}` because a browser textarea turns CRLF into LF, so the LF-only check cannot be run on pasted text (the engine still has it for raw input).
