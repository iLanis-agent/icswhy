const F=require('./engine.js'),cp=require('child_process');
let seed=2468;const rnd=n=>{seed=(seed*1103515245+12345)&0x7fffffff;return (seed>>8)%n};const pick=a=>a[rnd(a.length)];
const words=['Team','sync','Caf\u00e9','a,b','x;y','back\\slash','line\nbreak','\u00fcber','\u65e5\u672c\u8a9e','plain','Lunch: noon','5 o\'clock','\ud83d\ude00 party','"quoted"'];
const esc=s=>s.replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
const txt=()=>{let n=1+rnd(4),a=[];while(n--)a.push(pick(words));return a.join(' ')};
const tzs=['Europe/Berlin','America/New_York','Asia/Tokyo','Asia/Jerusalem'];
const pad=(n,w=2)=>String(n).padStart(w,'0');
const d=()=>{const y=2020+rnd(10),m=1+rnd(12),dd=1+rnd(28);return pad(y,4)+pad(m)+pad(dd)};
const t=()=>pad(rnd(24))+pad(rnd(60))+pad(rnd(60));
function fold(l){ // fold at 75 octets on code point boundaries
  const out=[];let cur='',len=0;for(const ch of l){const b=Buffer.byteLength(ch);if(len+b>(out.length?74:75)){out.push(cur);cur='';len=0}cur+=ch;len+=b}out.push(cur);return out.join('\r\n ')}
function ev(i){
  const L=['BEGIN:VEVENT','UID:u'+i+'@t','DTSTAMP:20261005T000000Z'];
  const k=rnd(4);let s,e;
  if(k===0){s=['DTSTART;VALUE=DATE:'+d()];e=rnd(2)?['DTEND;VALUE=DATE:'+d()]:[]}
  else if(k===1){s=['DTSTART:'+d()+'T'+t()];e=rnd(2)?['DTEND:'+d()+'T'+t()]:[]}
  else if(k===2){s=['DTSTART:'+d()+'T'+t()+'Z'];e=rnd(2)?['DTEND:'+d()+'T'+t()+'Z']:[]}
  else {const z=pick(tzs);s=['DTSTART;TZID='+z+':'+d()+'T'+t()];e=rnd(2)?['DTEND;TZID='+z+':'+d()+'T'+t()]:[]}
  L.push(...s,...e);
  if(rnd(5))L.push(fold('SUMMARY:'+esc(txt())));
  if(rnd(2))L.push(fold('DESCRIPTION:'+esc(txt()+' '+txt()+' '+txt())));
  if(rnd(2))L.push(fold('LOCATION'+(rnd(2)?';LANGUAGE=en':'')+':'+esc(txt())));
  L.push('END:VEVENT');return L.join('\r\n')}
const cases=[];
for(let i=0;i<1500;i++){let n=1+rnd(3),evs=[];for(let j=0;j<n;j++)evs.push(ev(i*10+j));cases.push('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\n'+evs.join('\r\n')+'\r\nEND:VCALENDAR\r\n')}
const o=JSON.parse(cp.execFileSync('python3',['oracle.py'],{input:JSON.stringify(cases),maxBuffer:1e9}));
let bad=[],cmp=0,py_err=0,evt=0;
cases.forEach((c,i)=>{const r=o[i];if(r.error){py_err++;return}const p=F.parse(c);
  if(p.events.length!==r.length){bad.push(['event count',i,p.events.length,r.length]);return}
  p.events.forEach((e,j)=>{evt++;const x=r[j];
    const m=(k,a,b)=>{cmp++;if(JSON.stringify(a)!==JSON.stringify(b))bad.push([k,i,a,b])};
    m('summary',e.text.SUMMARY===undefined?null:e.text.SUMMARY,x.summary);m('description',e.text.DESCRIPTION===undefined?null:e.text.DESCRIPTION,x.description);m('location',e.text.LOCATION===undefined?null:e.text.LOCATION,x.location);
    const k=t=>t?[t.kind==='tzid'?'tzid:'+t.tzid:t.kind,t.text]:null;m('start',k(e.start),x.start);m('end',k(e.end),x.end);
    const err=e.issues.filter(q=>q.lvl==='err').map(q=>q.msg);
    if(!/Missing|before|exclusive/.test(err.join()))0;});
});
console.log('calendars',cases.length,'events',evt,'field comparisons',cmp,'python parse errors',py_err,'discrepancies',bad.length);
if(bad.length)console.log(JSON.stringify(bad.slice(0,6)).slice(0,1200));
// behaviour checks on known-bad files (engine only)
const T=[
 ['BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:x\nBEGIN:VEVENT\nUID:1\nDTSTAMP:20261005T000000Z\nDTSTART;VALUE=DATE:20261010\nDTEND;VALUE=DATE:20261010\nSUMMARY:a\nEND:VEVENT\nEND:VCALENDAR','exclusive'],
 ['BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:x\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTAMP:20261005T000000Z\r\nDTSTART:20261010T100000\r\nSUMMARY:a\r\nEND:VEVENT\r\n','Unclosed'],
 ['BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:x\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTAMP:20261005T000000Z\r\nDTSTART;TZID=Europe/Berlin:20261010T100000\r\nDTEND;TZID=Europe/Berlin:20261010T090000\r\nSUMMARY:a, b\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n','before'],
];
let tb=0;T.forEach(([s,k])=>{const p=F.parse(s);const all=p.issues.concat(...p.events.map(e=>e.issues)).map(q=>q.msg).join(' | ');if(!all.includes(k)){tb++;console.log('MISSING issue',k,'in',all)}});
console.log('known-bad checks',T.length-tb,'/',T.length);
process.exit(bad.length||tb?1:0);
