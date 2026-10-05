(function (root) {
  'use strict';
  // iCalendar (RFC 5545) reader: unfolding, content lines, text escapes, date/time kinds, and the usual import problems.
  function utf8len(s) { return unescape(encodeURIComponent(s)).length; }
  function unfold(text) {
    var bare = /(^|[^\r])\n/.test(text.replace(/\r\n/g, '\r\n'));
    var lines = [], raw = text.split(/\r\n|\n|\r/), i, longLines = [];
    for (i = 0; i < raw.length; i++) {
      var l = raw[i];
      if ((l[0] === ' ' || l[0] === '\t') && lines.length) { lines[lines.length - 1].text += l.slice(1); lines[lines.length - 1].folded = true; }
      else if (l !== '') lines.push({ text: l, no: i + 1, folded: false });
      if (l !== '' && utf8len(l) > 75) longLines.push(i + 1);
    }
    return { lines: lines, bareLF: bare, longLines: longLines };
  }
  function parseLine(s) {
    var i = 0, n = s.length, inQ = false, nameEnd = -1, params = [], cur = '', name, value, c;
    var seg = [], start = 0, colon = -1;
    for (i = 0; i < n; i++) {
      c = s[i];
      if (c === '"') inQ = !inQ;
      else if (!inQ && (c === ';' || c === ':')) { seg.push(s.slice(start, i)); start = i + 1; if (c === ':') { colon = i; break; } }
    }
    if (colon < 0) return { error: 'no ":" separating name and value' };
    name = seg[0].toUpperCase();
    for (i = 1; i < seg.length; i++) { var eq = seg[i].indexOf('='); if (eq < 0) return { name: name, error: 'parameter "' + seg[i] + '" has no "="' }; params.push([seg[i].slice(0, eq).toUpperCase(), seg[i].slice(eq + 1).replace(/^"(.*)"$/, '$1')]); }
    value = s.slice(colon + 1);
    return { name: name, params: params, value: value };
  }
  function param(p, k) { for (var i = 0; i < p.params.length; i++) if (p.params[i][0] === k) return p.params[i][1]; return null; }
  function unescapeText(v) { return v.replace(/\\([\\;,nN])/g, function (m, c) { return c === 'n' || c === 'N' ? '\n' : c; }); }
  function hasBadEscape(v) { return /(^|[^\\])(\\\\)*[,;]/.test(v) || /\\[^\\;,nN]/.test(v); }
  // date-time reading: returns {kind:'date'|'floating'|'utc'|'tzid', text:'YYYY-MM-DD[THH:MM:SS]', tzid}
  function readTime(p) {
    var v = p.value, val = (param(p, 'VALUE') || '').toUpperCase(), tz = param(p, 'TZID'), m;
    if (val === 'DATE' || (!val && /^\d{8}$/.test(v))) { m = /^(\d{4})(\d{2})(\d{2})$/.exec(v); if (!m) return { error: 'DATE must be YYYYMMDD' }; return { kind: 'date', text: m[1] + '-' + m[2] + '-' + m[3] }; }
    m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
    if (!m) return { error: 'date-time must look like 20261005T093000, with a Z for UTC' };
    var text = m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6];
    if (m[7] === 'Z') { if (tz) return { kind: 'utc', text: text, tzid: tz, conflict: true }; return { kind: 'utc', text: text }; }
    if (tz) return { kind: 'tzid', text: text, tzid: tz };
    return { kind: 'floating', text: text };
  }
  function daysIn(t) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5; }
  function parse(text, opts) {
    opts = opts || {};
    var u = unfold(text), issues = [], events = [], stack = [], cur = null, hasTz = {}, cal = { version: null, prodid: null }, i, L, p;
    if (u.bareLF && !opts.pasted) issues.push({ lvl: 'warn', msg: 'Lines end with LF only. RFC 5545 requires CRLF; strict importers (some Outlook versions) may refuse the file.' });
    if (u.longLines.length) issues.push({ lvl: 'warn', msg: u.longLines.length + ' line(s) are longer than 75 bytes and not folded (line ' + u.longLines.slice(0, 5).join(', ') + (u.longLines.length > 5 ? ', ...' : '') + '). Most apps cope; strict ones do not.' });
    if (!u.lines.length) return { events: [], issues: [{ lvl: 'err', msg: 'No content lines found.' }], cal: cal };
    if (!/^BEGIN:VCALENDAR$/i.test(u.lines[0].text)) issues.push({ lvl: 'err', msg: 'The file must start with BEGIN:VCALENDAR (first line is "' + u.lines[0].text.slice(0, 40) + '").' });
    for (i = 0; i < u.lines.length; i++) {
      L = u.lines[i]; p = parseLine(L.text);
      if (p.error) { issues.push({ lvl: 'err', msg: 'Line ' + L.no + ': ' + p.error + '.' }); continue; }
      if (p.name === 'BEGIN') { stack.push(p.value.toUpperCase()); if (p.value.toUpperCase() === 'VEVENT') { cur = { props: [], line: L.no }; } continue; }
      if (p.name === 'END') {
        var top = stack.pop();
        if (top !== p.value.toUpperCase()) issues.push({ lvl: 'err', msg: 'Line ' + L.no + ': END:' + p.value + ' does not match the open BEGIN:' + (top || '(nothing)') + '.' });
        if (p.value.toUpperCase() === 'VEVENT' && cur) { events.push(cur); cur = null; }
        continue;
      }
      if (stack[stack.length - 1] === 'VEVENT' && cur) { cur.props.push(p); }
      else if (stack[stack.length - 1] === 'VCALENDAR') { if (p.name === 'VERSION') cal.version = p.value; if (p.name === 'PRODID') cal.prodid = p.value; }
      else if (stack[stack.length - 1] === 'VTIMEZONE' && p.name === 'TZID') hasTz[p.value] = true;
    }
    if (stack.length) issues.push({ lvl: 'err', msg: 'Unclosed block: ' + stack.join(' > ') + '. A BEGIN has no matching END (file may be cut off).' });
    if (cal.version === null) issues.push({ lvl: 'err', msg: 'Missing VERSION:2.0 in VCALENDAR.' }); else if (cal.version !== '2.0') issues.push({ lvl: 'err', msg: 'VERSION is "' + cal.version + '" but must be 2.0.' });
    if (cal.prodid === null) issues.push({ lvl: 'err', msg: 'Missing PRODID in VCALENDAR.' });
    if (!events.length) issues.push({ lvl: 'warn', msg: 'No VEVENT found.' });
    var uids = {};
    var out = events.map(function (ev, k) {
      var e = { n: k + 1, issues: [], summary: null, text: {} }, get = function (nm) { return ev.props.filter(function (x) { return x.name === nm; }); };
      ['SUMMARY', 'DESCRIPTION', 'LOCATION'].forEach(function (nm) { var g = get(nm)[0]; if (g) { e.text[nm] = unescapeText(g.value); if (hasBadEscape(g.value)) e.issues.push({ lvl: 'warn', msg: nm + ' has an unescaped comma or semicolon (or a bad backslash). Write \\, \\; \\\\ and \\n.' }); } });
      e.summary = e.text.SUMMARY || null;
      ['UID', 'DTSTAMP', 'DTSTART'].forEach(function (nm) { if (!get(nm).length) e.issues.push({ lvl: 'err', msg: 'Missing ' + nm + '.' }); });
      var uid = get('UID')[0]; if (uid) { if (uids[uid.value]) e.issues.push({ lvl: 'warn', msg: 'UID "' + uid.value + '" is used by another event. Importers treat same UID as the same event and keep one.' }); uids[uid.value] = true; }
      var ds = get('DTSTART')[0], de = get('DTEND')[0], du = get('DURATION')[0];
      if (ds) { e.start = readTime(ds); if (e.start.error) e.issues.push({ lvl: 'err', msg: 'DTSTART: ' + e.start.error + '.' }); }
      if (de) { e.end = readTime(de); if (e.end.error) e.issues.push({ lvl: 'err', msg: 'DTEND: ' + e.end.error + '.' }); }
      if (de && du) e.issues.push({ lvl: 'err', msg: 'DTEND and DURATION are both present. Only one is allowed.' });
      [e.start, e.end].forEach(function (t) {
        if (!t || t.error) return;
        if (t.conflict) e.issues.push({ lvl: 'warn', msg: 'Time ends in Z (UTC) but also has TZID=' + t.tzid + '. The TZID is ignored by most apps; use one or the other.' });
        if (t.kind === 'tzid' && !hasTz[t.tzid] && !e.issues.some(function (q) { return q.msg.indexOf('TZID=' + t.tzid + ' has no') === 0; })) e.issues.push({ lvl: 'warn', msg: 'TZID=' + t.tzid + ' has no VTIMEZONE block in the file. Apps that know the name may cope; others will shift or ignore the time.' });
        if (t.kind === 'floating') e.issues.push({ lvl: 'info', msg: 'A time without Z or TZID is "floating": it shows as the same clock time in every time zone, which is rarely what an invitation wants.' });
      });
      if (e.start && e.end && !e.start.error && !e.end.error) {
        if (e.start.kind === 'date' && e.end.kind !== 'date' || e.start.kind !== 'date' && e.end.kind === 'date') e.issues.push({ lvl: 'err', msg: 'DTSTART and DTEND must both be dates or both be date-times.' });
        else if (e.start.kind === 'date') {
          var dd = daysIn(e.end.text) - daysIn(e.start.text);
          if (dd <= 0) e.issues.push({ lvl: 'err', msg: 'All-day DTEND (' + e.end.text + ') is not after DTSTART. DTEND for a date is exclusive: a one-day event on 10 Oct ends on 11 Oct.' });
          e.days = dd;
        } else if (e.start.kind === e.end.kind && (e.start.kind !== 'tzid' || e.start.tzid === e.end.tzid) && e.end.text < e.start.text) e.issues.push({ lvl: 'err', msg: 'DTEND is before DTSTART.' });
      }
      if (e.start && !e.start.error && e.start.kind === 'date' && !de && !du) e.days = 1;
      if (!e.summary) e.issues.push({ lvl: 'info', msg: 'No SUMMARY: the event will show as untitled.' });
      return e;
    });
    return { events: out, issues: issues, cal: cal };
  }
  function describeTime(t) {
    if (!t || t.error) return '';
    if (t.kind === 'date') return 'all day ' + t.text;
    if (t.kind === 'utc') return t.text.replace('T', ' ') + ' UTC';
    if (t.kind === 'tzid') return t.text.replace('T', ' ') + ' in ' + t.tzid;
    return t.text.replace('T', ' ') + ' floating (no time zone)';
  }
  var api = { unfold: unfold, parseLine: parseLine, unescapeText: unescapeText, readTime: readTime, parse: parse, describeTime: describeTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.IcsWhy = api;
})(typeof window !== 'undefined' ? window : this);
