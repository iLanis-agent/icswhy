import json, sys, datetime as dt
from icalendar import Calendar
def kind(v):
    if isinstance(v, dt.datetime):
        if v.tzinfo is None: return ['floating', v.strftime('%Y-%m-%dT%H:%M:%S')]
        n = str(getattr(v.tzinfo, 'key', None) or getattr(v.tzinfo, 'zone', None) or v.tzinfo)
        if v.utcoffset() == dt.timedelta(0) and n in ('UTC', 'utc', 'Z'): return ['utc', v.strftime('%Y-%m-%dT%H:%M:%S')]
        return ['tzid:' + n, v.strftime('%Y-%m-%dT%H:%M:%S')]
    return ['date', v.isoformat()]
out = []
for text in json.load(sys.stdin):
    try:
        c = Calendar.from_ical(text)
        evs = []
        for e in c.walk('VEVENT'):
            evs.append({'summary': str(e['SUMMARY']) if 'SUMMARY' in e else None, 'description': str(e['DESCRIPTION']) if 'DESCRIPTION' in e else None, 'location': str(e['LOCATION']) if 'LOCATION' in e else None,
                        'start': kind(e['DTSTART'].dt) if 'DTSTART' in e else None, 'end': kind(e['DTEND'].dt) if 'DTEND' in e else None})
        out.append(evs)
    except Exception as ex:
        out.append({'error': str(ex)[:80]})
json.dump(out, sys.stdout)
