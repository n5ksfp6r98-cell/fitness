import { UNITS, PICK, PFLICHT, WEEK, KAMPF, order, allExercises } from './plan.js';
import * as S from './store.js';

const $app = document.getElementById('app');
const ui = { tab: 'heute', session: null, histEx: null, histShift: 'frueh', histMode: 'ex', modal: null, drafts: {}, rest: null, timer: null, suppEdit: false, authMsg: '', exFrom: null, exTo: null };
let client = null;
let authed = false;
let authChecked = false; // erst nach dem Laden der Sitzung 'nicht angemeldet' zeigen

// ---------- Datum ----------
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const params = new URLSearchParams(location.search);
const DEV = ['localhost', '127.0.0.1'].includes(location.hostname) && params.has('dev');
// Im Testmodus lässt sich ein Datum vorgeben (?dev=1&day=2026-11-03)
const today = () => (DEV && params.get('day')) || iso(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const weekday = s => (parse(s).getDay() + 6) % 7;
const monday = s => addDays(s, -weekday(s));
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const dm = s => { const d = parse(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`; };
const fmt = s => `${DAYS[weekday(s)].slice(0, 2)} ${dm(s)}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SHIFT = { frueh: 'Früh', spaet: 'Spät' };
const other = s => (s === 'frueh' ? 'spaet' : 'frueh');

// ---------- Einstellungen / Schicht / Phase ----------
function settings() { return S.get('settings')?.data || {}; }
function phaseOf(day) { return day >= (settings().kickStart || '2026-12-01') ? 'dez' : 'vor'; }
function weekRec(day) { return S.get('week:' + monday(day)); }
function shiftOf(day) {
  const mon = monday(day);
  const r = S.get('week:' + mon);
  if (r) return r.data.shift;
  // aus der nächstgelegenen eingetragenen Woche fortschreiben (Wochenwechsel)
  let best = null;
  for (const w of S.all('week')) {
    const d = Math.abs(daysBetween(w.day, mon));
    if (!best || d < best.d) best = { d, w };
  }
  if (!best) return 'frueh';
  return (best.d / 7) % 2 === 0 ? best.w.data.shift : other(best.w.data.shift);
}
function setShift(day, shift) { S.put('week:' + monday(day), 'week', monday(day), { shift }); }
// Sevbans Wunsch (09.11.2026): Zirkel und Technik sind nie Tagesvorschlag, nur optional an diesem Tag.
const OPTIONAL = ['zirkel', 'technik'];
function slot(day) {
  const s = WEEK[phaseOf(day)][shiftOf(day)][weekday(day)];
  return OPTIONAL.includes(s.main) ? { opt: [s.main] } : s;
}

// ---------- Einheiten ----------
const sessions = () => S.all('session').sort((a, b) => (a.day + (a.data.startedAt || '')).localeCompare(b.day + (b.data.startedAt || '')));
const isKraft = type => UNITS[type]?.kind === 'kraft';
const seq = type => (type.startsWith('ok') ? 'ok' : type);
const seqName = s => (s === 'ok' ? 'Oberkörper' : UNITS[s].name);
const unitName = type => UNITS[type]?.name || type;
const sessionsOn = day => sessions().filter(s => s.day === day);
const realOn = day => sessionsOn(day).filter(s => s.data.status !== 'uebersprungen');

function nextStrength(day) {
  const ord = order(phaseOf(day), shiftOf(day));
  const last = sessions().filter(s => isKraft(s.data.type) && s.day <= day).pop();
  if (!last) return ord[0];
  const i = ord.indexOf(seq(last.data.type));
  return ord[(i + 1) % ord.length];
}

function createSession(type, status = 'aktiv') {
  const day = today();
  const id = 's:' + S.uuid();
  S.put(id, 'session', day, { type, shift: shiftOf(day), status, notfall: false, skip: [], sets: {}, blocks: {}, feel: null, startedAt: new Date().toISOString() });
  return id;
}

function warnings(type) {
  const day = today();
  const w = [];
  const done = realOn(day);
  if (done.length) w.push(`Heute gibt es schon eine Einheit (${done.map(s => unitName(s.data.type)).join(', ')}). Regel: nie zwei Einheiten am selben Tag.`);
  if (type === 'beine' && realOn(addDays(day, -1)).some(s => s.data.type === 'pull'))
    w.push('Gestern war Pull. Möglichst 1 Tag Pause zwischen Pull und Beinen (Griff, unterer Rücken).');
  if (type === 'pull') {
    const ord = order(phaseOf(day), shiftOf(day));
    const tomorrow = slot(addDays(day, 1)).main;
    if (ord[ord.indexOf('pull') + 1] === 'beine' && tomorrow && tomorrow !== 'ok' && isKraft(tomorrow))
      w.push('Morgen wäre laut Reihe Beine dran. Möglichst 1 Tag Pause zwischen Pull und Beinen.');
  }
  if (isKraft(type)) {
    const n = nextStrength(day);
    if (seq(type) !== n) w.push(`Laut Reihe ist ${seqName(n)} dran. ${unitName(type)} geht trotzdem.`);
  }
  return w;
}

function start(type) {
  const w = warnings(type);
  if (!w.length) return openSession(createSession(type));
  ui.modal = { title: 'Kurzer Hinweis', lines: w, ok: 'Trotzdem starten', onOk: () => openSession(createSession(type)) };
  render();
}
function openSession(id) { ui.session = id; ui.rest = null; window.scrollTo(0, 0); render(); }

// ---------- Sätze / Verlauf ----------
const setsOf = sid => S.all('set').filter(r => r.data.session === sid).sort((a, b) => a.data.no - b.data.no);
function exSets(name) { return S.all('set').filter(r => r.data.ex === name); }
// Sätze einer Übung, gruppiert pro Einheit, neueste zuerst
function exHistory(name, shift, excludeSession) {
  const by = new Map();
  for (const r of exSets(name)) {
    if (r.data.session === excludeSession) continue;
    if (shift && r.data.shift !== shift) continue;
    const k = r.data.session;
    if (!by.has(k)) by.set(k, { session: k, day: r.day, shift: r.data.shift, sets: [], notfall: !!S.get(k)?.data.notfall });
    by.get(k).sets.push(r.data);
  }
  return [...by.values()].map(g => (g.sets.sort((a, b) => a.no - b.no), g)).sort((a, b) => (b.day + b.session).localeCompare(a.day + a.session));
}
function lastFor(name, shift, sid) { return exHistory(name, shift, sid)[0] || exHistory(name, null, sid)[0] || null; }
const topReached = (sets, ex) => ex.r && sets.length >= ex.s && sets.every(s => Number(s.r) >= ex.r[1]);
const setStr = (s, ex) => `${ex?.bw ? (Number(s.w) ? '+' + s.w + ' kg' : 'KG') : s.w + ' kg'} × ${s.r}${ex?.sek ? ' s' : ''}`;
const exInfo = name => allExercises().find(e => e.n === name);

function effSets(sess, i, ex) {
  const base = sess.data.sets?.[i] ?? ex.s;
  return sess.data.notfall ? Math.min(base, 2) : base;
}

function draftFor(sess, i, ex) {
  const k = sess.id + ':' + i;
  if (ui.drafts[k]) return ui.drafts[k];
  const done = setsOf(sess.id).filter(s => s.data.ex === ex.n);
  let w = ex.bw ? 0 : '', r = ex.r ? ex.r[0] : (ex.sek ? 30 : 8);
  const prev = done[done.length - 1];
  if (prev) { w = prev.data.w; r = prev.data.r; }
  else {
    const last = lastFor(ex.n, sess.data.shift, sess.id);
    const ls = last?.sets[done.length] || last?.sets[last.sets.length - 1];
    if (ls) { w = ls.w; r = ls.r; }
  }
  return (ui.drafts[k] = { w, r });
}

// ---------- Rendering ----------
function render() {
  if (!S.owner()) return renderLogin();
  let h = '';
  const sess = ui.session && S.get(ui.session);
  if (sess) h = UNITS[sess.data.type].kind === 'kraft' ? viewKraft(sess) : viewKampf(sess);
  else {
    ui.session = null;
    h = `<main class="page">${ui.tab === 'heute' ? viewToday() : ui.tab === 'verlauf' ? viewHistory() : viewMore()}</main>${nav()}`;
  }
  if (ui.modal) h += modal();
  $app.innerHTML = h;
  if (ui.timer) paintTimer();
  paintRest();
}

function syncChip() {
  const p = S.pending();
  let txt, cls = '';
  if (!navigator.onLine) { txt = p ? `Offline · ${p} gespeichert, wird später übertragen` : 'Offline · alles lokal gespeichert'; cls = 'off'; }
  else if (DEV) { txt = 'Testmodus · nur lokal'; cls = 'off'; }
  else if (!authed && authChecked) { txt = 'Nicht angemeldet · nur auf dem Gerät'; cls = 'off'; }
  else if (!authed) txt = 'Verbinde …';
  else if (S.status.error) { txt = 'Sync-Fehler: ' + S.status.error; cls = 'err'; }
  else if (S.status.syncing || p) txt = 'Synchronisiere …';
  else txt = 'Synchronisiert';
  return `<div class="chip ${cls}" data-a="sync">${esc(txt)}</div>`;
}

function nav() {
  const b = (t, l) => `<button class="${ui.tab === t ? 'on' : ''}" data-a="tab" data-v="${t}">${l}</button>`;
  return `<nav class="tabs">${b('heute', 'Heute')}${b('verlauf', 'Verlauf')}${b('mehr', 'Export & Mehr')}</nav>`;
}

function viewToday() {
  const day = today();
  const shift = shiftOf(day);
  const sl = slot(day);
  const todays = sessionsOn(day);
  const real = todays.filter(s => s.data.status !== 'uebersprungen');
  const skipped = todays.some(s => s.data.status === 'uebersprungen');
  const next = nextStrength(day);
  let h = `<header class="top"><div><div class="muted">${DAYS[weekday(day)]}, ${dm(day)}</div><h1>Heute</h1></div>${syncChip()}</header>`;
  if (!authed && authChecked && S.owner() !== 'dev') h += `<div class="card note">Nicht angemeldet. Eingaben werden auf dem Gerät gespeichert. <button class="btn small" data-a="relogin">Anmelden</button></div>`;

  // Schicht
  h += `<section class="card"><div class="row between"><b>Schicht diese Woche</b>
    <div class="seg">${['frueh', 'spaet'].map(s => `<button class="${s === shift ? 'on' : ''}" data-a="shift" data-v="${s}">${SHIFT[s]}</button>`).join('')}</div></div>
    <p class="muted small">Tipp: Pro Woche umschaltbar, der Wochenplan passt sich an.${weekRec(day) ? '' : ' Noch nicht bestätigt, aus dem Wochenwechsel geschätzt.'}</p></section>`;

  // Wiedereinstieg
  const lastReal = sessions().filter(s => s.data.status === 'fertig' && isKraft(s.data.type)).pop();
  if (lastReal && daysBetween(lastReal.day, day) > 10)
    h += `<div class="card note">Wiedereinstieg: gleiche Gewichte wie zuletzt, weniger Wiederholungen sind normal und kein Rückschritt.</div>`;

  // Heutige Einheiten
  for (const s of todays) {
    const st = s.data.status;
    h += `<section class="card today-sess"><div class="row between"><div><div class="muted small">Heute</div><b>${esc(unitName(s.data.type))}</b></div>
      ${st === 'aktiv' ? `<button class="btn" data-a="open" data-v="${s.id}">Weiter</button>`
        : st === 'uebersprungen' ? `<span class="tag">${UNITS[s.data.type].kind === 'kampf' ? 'weggelassen' : 'übersprungen'}</span> <button class="btn ghost small" data-a="unskip" data-v="${s.id}">Rückgängig</button>`
        : `<span class="tag ok">erledigt</span> <button class="btn ghost small" data-a="open" data-v="${s.id}">Ansehen</button>`}</div></section>`;
  }

  // Vorschlag
  if (real.length) {
    h += `<section class="card"><p>Heute schon trainiert. Regel: nie zwei Einheiten am selben Tag.</p><p class="muted small">Als Nächstes in der Reihe: <b>${seqName(next)}</b></p></section>`;
  } else if (!skipped) {
    const startBtns = s => s === 'ok'
      ? `<div class="grid2"><button class="btn big" data-a="start" data-v="ok_a">Oberkörper A<br><small>Gym</small></button><button class="btn big" data-a="start" data-v="ok_b">Oberkörper B<br><small>Calisthenics</small></button></div>`
      : `<button class="btn big" data-a="start" data-v="${s}">${esc(unitName(s))} starten</button>`;
    const planTxt = `${DAYS[weekday(day)]}, ${SHIFT[shift]}schicht-Woche: ${sl.main ? (sl.label || seqName(sl.main)) : 'frei'}${sl.opt ? ` (${sl.label || UNITS[sl.opt[0]].name + ' optional'})` : ''}`;
    if (sl.main && isKraft(sl.main === 'ok' ? 'ok_a' : sl.main)) {
      h += `<section class="card hero"><div class="muted small">Vorschlag</div><h2>${seqName(next)}</h2>
        <p class="muted small">Laut Wochenplan: ${esc(planTxt)}. Reihe: ${order(phaseOf(day), shift).map(seqName).join(' → ')}${next !== sl.main ? `. Die Reihe geht vor: als Nächstes ist ${seqName(next)} dran.` : '.'}</p>
        ${startBtns(next)}
        <button class="btn ghost" data-a="skip" data-v="${next === 'ok' ? 'ok_a' : next}">Heute auslassen</button>
        <p class="muted small">Ausgelassen wird nicht nachgeholt. Die Reihe geht mit der nächsten Einheit weiter.</p></section>`;
    } else if (sl.main) {
      h += `<section class="card hero"><div class="muted small">Vorschlag (Kampfsport, optional)</div><h2>${esc(sl.label || unitName(sl.main))}</h2>
        <p class="muted small">Laut Wochenplan: ${esc(planTxt)}. Nächste Krafteinheit: ${seqName(next)}.</p>
        ${startBtns(sl.main)}
        <button class="btn ghost" data-a="skip" data-v="${sl.main}">Heute weglassen</button>
        <p class="muted small">Optional, zählt nie als verpasst.</p></section>`;
    } else {
      h += `<section class="card hero"><div class="muted small">Laut Wochenplan</div><h2>Frei</h2>
        <p class="muted small">${esc(planTxt)}. Nächste Krafteinheit in der Reihe: <b>${seqName(next)}</b>.</p>
        ${sl.opt ? sl.opt.map(o => `<button class="btn big alt" data-a="start" data-v="${o}">${esc(unitName(o))} (optional)</button>`).join('') : ''}</section>`;
    }
  }

  // Andere Einheit
  h += `<section class="card"><b>Andere Einheit wählen</b><div class="grid2 pick">${PICK.map(t => `<button class="btn ${isKraft(t) ? '' : 'alt'}" data-a="start" data-v="${t}">${esc(unitName(t))}</button>`).join('')}</div></section>`;

  // Wochenziel
  const mon = monday(day);
  const week = sessions().filter(s => s.day >= mon && s.day <= addDays(mon, 6) && s.data.status === 'fertig');
  const has = t => week.some(s => s.data.type === t);
  const cnt = PFLICHT.filter(has).length;
  h += `<section class="card"><div class="row between"><b>Pflicht diese Woche</b><span class="count">${cnt} von 3</span></div>
    <div class="goal">${PFLICHT.map(t => `<span class="${has(t) ? 'done' : ''}">${has(t) ? '✓ ' : ''}${UNITS[t].name}</span>`).join('')}</div>
    <p class="muted small">Bonus: Oberkörper ${week.filter(s => s.data.type.startsWith('ok')).length} · Kampfsport ${week.filter(s => UNITS[s.data.type].kind === 'kampf').length}${cnt === 3 ? ' · Woche geschafft.' : ''}</p></section>`;

  h += viewSupps(day);

  // Wochenplan
  h += `<details class="card"><summary><b>Wochenplan (${SHIFT[shift]}schicht${phaseOf(day) === 'dez' ? ', mit Kickboxen' : ''})</b></summary><table class="plan">${DAYS.map((d, i) => {
    const dd = addDays(mon, i);
    const s = slot(dd);
    const ses = sessionsOn(dd).map(x => `${unitName(x.data.type)}${x.data.status === 'uebersprungen' ? ' (übersprungen)' : x.data.status === 'fertig' ? ' ✓' : ''}`).join(', ');
    return `<tr class="${dd === day ? 'now' : ''}"><td>${d.slice(0, 2)}</td><td>${s.main ? esc(s.label || seqName(s.main)) : s.opt ? esc(s.label || 'frei (' + UNITS[s.opt[0]].name + ' optional)') : 'frei'}</td><td class="muted">${esc(ses)}</td></tr>`;
  }).join('')}</table><p class="muted small">Reihenfolge fix, Tage flexibel. Kraft vor Kampfsport.</p></details>`;
  return h;
}

// Die Liste selbst liegt nur in Supabase (kind 'supplements'), nicht im Code.
// Abgesetzte Supplements (off: true) bleiben gespeichert, damit alte Haken im Verlauf ihren Namen behalten.
function suppList() { return S.get('supplements')?.data.items || []; }
function viewSupps(day) {
  const items = suppList().filter(it => !it.off);
  const checked = S.get('supp:' + day)?.data.checked || {};
  if (ui.suppEdit) {
    return `<section class="card"><div class="row between"><b>Supplements bearbeiten</b><button class="btn small" data-a="suppSave">Fertig</button></div>
      <p class="muted small">Dosis und Zeit trägst du selbst ein (Herstellerangabe oder Arzt).</p>
      ${ui.suppDraft.map((it, i) => it.off ? '' : `<div class="suppedit"><input data-supp="${i}" data-f="name" value="${esc(it.name)}" placeholder="Name">
        <input data-supp="${i}" data-f="dose" value="${esc(it.dose)}" placeholder="Dosis"><input data-supp="${i}" data-f="time" value="${esc(it.time)}" placeholder="Zeit">
        <button class="btn ghost small" data-a="suppDel" data-v="${i}">✕</button></div>`).join('')}
      <button class="btn ghost" data-a="suppAdd">+ Supplement</button></section>`;
  }
  const n = items.filter(it => checked[it.id]).length;
  return `<section class="card"><div class="row between"><b>Supplements heute</b><span class="muted small">${n}/${items.length} <button class="btn ghost small" data-a="suppEdit">Bearbeiten</button></span></div>
    ${items.length ? '' : '<p class="muted small">Noch keine Supplements eingetragen.</p>'}
    <div class="checks">${items.map(it => `<button class="check ${checked[it.id] ? 'on' : ''}" data-a="supp" data-v="${esc(it.id)}"><span class="box">${checked[it.id] ? '✓' : ''}</span><span>${esc(it.name)}${it.dose || it.time ? `<small class="muted"> ${esc([it.dose, it.time].filter(Boolean).join(' · '))}</small>` : ''}</span></button>`).join('')}</div></section>`;
}

// ---------- Krafteinheit ----------
function viewKraft(sess) {
  const u = UNITS[sess.data.type];
  const done = sess.data.status === 'fertig';
  const all = setsOf(sess.id);
  let h = `<header class="bar"><button class="btn ghost small" data-a="back">‹ Zurück</button><div class="ttl"><b>${esc(u.name)}</b><span class="muted small">${fmt(sess.day)} · ${SHIFT[sess.data.shift]}schicht</span></div>${syncChip()}</header><main class="page">`;
  if (u.note) h += `<p class="muted small">${esc(u.note)}</p>`;
  h += `<button class="toggle ${sess.data.notfall ? 'on' : ''}" data-a="notfall"><span class="box">${sess.data.notfall ? '✓' : ''}</span><span><b>Notfallmodus</b><br><small>2 Sätze pro Übung. Hingehen zählt.</small></span></button>`;
  u.ex.forEach((ex, i) => {
    if (sess.data.skip?.includes(i)) {
      h += `<section class="card ex skipped"><div class="row between"><span>${esc(ex.n)} <span class="tag">weggelassen</span></span><button class="btn ghost small" data-a="exUnskip" data-v="${i}">Zurückholen</button></div></section>`;
      return;
    }
    const sets = all.filter(s => s.data.ex === ex.n);
    const n = effSets(sess, i, ex);
    const last = lastFor(ex.n, sess.data.shift, sess.id);
    const target = `${n} ${n === 1 ? 'Satz' : 'Sätze'}${ex.r ? ` × ${ex.r[0] === ex.r[1] ? ex.r[0] : ex.r[0] + '-' + ex.r[1]} Wdh.` : ''}${ex.hint ? ' · ' + ex.hint : ''}`;
    const steigern = (last && topReached(last.sets, ex)) || topReached(sets.map(s => s.data), ex);
    h += `<section class="card ex ${sets.length >= n ? 'complete' : ''}"><div class="row between"><h3>${esc(ex.n)}</h3><span class="muted small">${sets.length}/${n}</span></div>
      <div class="muted small">${target}</div>
      ${last ? `<div class="last">Letztes Mal (${SHIFT[last.shift]}, ${dm(last.day)}): ${last.sets.map(s => setStr(s, ex)).join(' · ')}</div>` : ''}
      ${steigern ? `<div class="hint">Gewicht steigern? Obere Grenze in allen Sätzen geschafft.</div>` : ''}
      ${sets.map(s => `<div class="setrow"><span>Satz ${s.data.no}</span><b>${setStr(s.data, ex)}</b><button class="btn ghost small" data-a="setDel" data-v="${s.id}" aria-label="Satz löschen">✕</button></div>`).join('')}`;
    if (!done) {
      const d = draftFor(sess, i, ex);
      const more = sets.length >= n;
      h += `<div class="entry ${more ? 'extra' : ''}">
        <div class="stepper"><label>${ex.bw ? 'Zusatz kg' : 'kg'}</label><button data-a="step" data-v="${i}" data-f="w" data-d="-2.5">−</button><input inputmode="decimal" data-draft="${i}" data-f="w" value="${esc(d.w)}"><button data-a="step" data-v="${i}" data-f="w" data-d="2.5">+</button></div>
        <div class="stepper"><label>${ex.sek ? 'Sek.' : 'Wdh.'}</label><button data-a="step" data-v="${i}" data-f="r" data-d="${ex.sek ? -5 : -1}">−</button><input inputmode="numeric" data-draft="${i}" data-f="r" value="${esc(d.r)}"><button data-a="step" data-v="${i}" data-f="r" data-d="${ex.sek ? 5 : 1}">+</button></div>
        <button class="btn big ${more ? 'ghost' : ''}" data-a="setSave" data-v="${i}">${more ? '+ Extra-Satz' : `✓ Satz ${sets.length + 1} speichern`}</button></div>
        <div class="row exact"><button class="btn ghost small" data-a="setsMinus" data-v="${i}">− Satz</button><button class="btn ghost small" data-a="setsPlus" data-v="${i}">+ Satz</button><button class="btn ghost small" data-a="exSkip" data-v="${i}">Übung weglassen</button></div>`;
    }
    h += `</section>`;
  });
  h += done
    ? `<p class="muted center">Einheit erledigt.</p><button class="btn ghost" data-a="reopen">Wieder öffnen</button>`
    : `<button class="btn big" data-a="finish">Einheit beenden</button>`;
  h += `<button class="btn ghost danger" data-a="discard">Einheit löschen</button><div class="spacer"></div></main><div id="rest"></div>`;
  return h;
}

// ---------- Kampfsport ----------
function viewKampf(sess) {
  const type = sess.data.type;
  const blocks = KAMPF[type];
  const done = sess.data.status === 'fertig';
  const b = sess.data.blocks || {};
  let h = `<header class="bar"><button class="btn ghost small" data-a="back">‹ Zurück</button><div class="ttl"><b>${esc(unitName(type))}</b><span class="muted small">${fmt(sess.day)} · ${SHIFT[sess.data.shift]}schicht</span></div>${syncChip()}</header><main class="page">`;
  h += `<p class="muted small">Kein kg/Wdh. Abhaken, was du gemacht hast.</p>`;
  for (const bl of blocks) {
    const allDone = bl.items.every((_, j) => b[bl.key + j]);
    h += `<section class="card"><div class="row between"><b>${esc(bl.title)}</b><button class="btn ghost small" data-a="blockAll" data-v="${bl.key}">${allDone ? 'Alle ab' : 'Alle ✓'}</button></div>
      <div class="checks">${bl.items.map((it, j) => `<button class="check ${b[bl.key + j] ? 'on' : ''}" data-a="blockItem" data-v="${bl.key + j}"><span class="box">${b[bl.key + j] ? '✓' : ''}</span><span>${esc(it)}</span></button>`).join('')}</div>
      ${bl.timer ? `<button class="btn alt" data-a="timerOpen" data-v="${bl.key}">⏱ Timer starten</button>` : ''}</section>`;
    if (ui.timer && ui.timer.sid === sess.id && ui.timer.key === bl.key) h += `<section class="card timer" id="timer"></section>`;
  }
  h += `<section class="card"><b>Gefühl (optional)</b><div class="seg wide">${['leicht', 'mittel', 'schwer'].map(f => `<button class="${sess.data.feel === f ? 'on' : ''}" data-a="feel" data-v="${f}">${f}</button>`).join('')}</div></section>`;
  h += done ? `<p class="muted center">Einheit erledigt.</p><button class="btn ghost" data-a="reopen">Wieder öffnen</button>` : `<button class="btn big" data-a="finish">Einheit beenden</button>`;
  h += `<button class="btn ghost danger" data-a="discard">Einheit löschen</button><div class="spacer"></div></main>`;
  return h;
}

// ---------- Timer ----------
let tick = null, audio = null, wake = null;
function beep(freq = 880, ms = 180) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.3, audio.currentTime);
    o.start(); o.stop(audio.currentTime + ms / 1000);
  } catch { /* kein Audio */ }
  navigator.vibrate?.(200);
}
function timerOpen(key) {
  const sess = S.get(ui.session);
  const bl = KAMPF[sess.data.type].find(x => x.key === key);
  ui.timer = { sid: sess.id, key, title: bl.title, phases: bl.timer(), idx: 0, left: bl.timer()[0].sec * 1000, endAt: null };
  render();
  document.getElementById('timer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function timerToggle() {
  const t = ui.timer;
  if (t.endAt) { t.left = t.endAt - Date.now(); t.endAt = null; clearInterval(tick); wake?.release?.(); wake = null; }
  else {
    beep(660, 80);
    t.endAt = Date.now() + t.left;
    tick = setInterval(timerTick, 200);
    navigator.wakeLock?.request('screen').then(w => (wake = w)).catch(() => {});
  }
  paintTimer();
}
function timerNext(auto) {
  const t = ui.timer;
  if (t.idx >= t.phases.length - 1) { clearInterval(tick); t.endAt = null; t.left = 0; t.finished = true; beep(1046, 600); wake?.release?.(); paintTimer(); return; }
  t.idx++;
  t.left = t.phases[t.idx].sec * 1000;
  if (t.endAt || auto) t.endAt = Date.now() + t.left;
  beep(t.phases[t.idx].work ? 988 : 523, 300);
  paintTimer();
}
function timerTick() {
  const t = ui.timer;
  if (!t || !t.endAt) return clearInterval(tick);
  const left = t.endAt - Date.now();
  const prevSec = Math.ceil(t.left / 1000);
  t.left = left;
  const sec = Math.ceil(left / 1000);
  if (sec !== prevSec && sec <= 3 && sec > 0) beep(440, 90);
  if (left <= 0) timerNext(true);
  else paintTimer();
}
function paintTimer() {
  const el = document.getElementById('timer');
  const t = ui.timer;
  if (!el || !t) return;
  const p = t.phases[t.idx];
  const s = Math.max(0, Math.ceil(t.left / 1000));
  el.className = 'card timer ' + (t.finished ? 'fin' : p.work ? 'work' : 'rest');
  el.innerHTML = `<div class="row between"><span class="muted small">${esc(t.title)}</span><button class="btn ghost small" data-a="timerClose">✕</button></div>
    <div class="phase">${t.finished ? 'Fertig' : esc(p.label)}</div>
    ${!t.finished && p.next ? `<div class="muted small">Nächste: ${esc(p.next)}</div>` : ''}
    <div class="clock">${Math.floor(s / 60)}:${pad(s % 60)}</div>
    <div class="muted small">${t.finished ? '' : esc(p.info || '')} · Abschnitt ${t.idx + 1}/${t.phases.length}</div>
    ${t.finished ? '' : `<div class="grid2"><button class="btn big" data-a="timerToggle">${t.endAt ? 'Pause' : 'Start'}</button><button class="btn big ghost" data-a="timerSkip">Weiter ›</button></div>`}`;
}

// Pausenanzeige nach einem Satz (zählt hoch)
let restTick = null;
function paintRest() {
  const el = document.getElementById('rest');
  if (!el) { clearInterval(restTick); restTick = null; return; }
  if (!ui.rest) { el.innerHTML = ''; return; }
  const s = Math.floor((Date.now() - ui.rest.at) / 1000);
  el.innerHTML = `<div class="restbar"><span>Pause <b>${Math.floor(s / 60)}:${pad(s % 60)}</b> · Ziel ${ui.rest.c ? '2-3' : '1,5-2'} Min</span><button class="btn ghost small" data-a="restClose">✕</button></div>`;
  if (!restTick) restTick = setInterval(paintRest, 1000);
}

// ---------- Verlauf ----------
function chart(points) {
  if (points.length < 2) return '';
  const W = 320, H = 90, P = 8;
  const ys = points.map(p => p.y), min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const xy = points.map((p, i) => [P + (i * (W - 2 * P)) / (points.length - 1), H - P - ((p.y - min) / span) * (H - 2 * P)]);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf"><polyline fill="none" stroke="currentColor" stroke-width="2.5" points="${xy.map(a => a.join(',')).join(' ')}"/>${xy.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="currentColor"/>`).join('')}</svg>
    <div class="row between muted small"><span>${dm(points[0].day)}</span><span>${min === max ? max : min + ' – ' + max} ${points[0].unit}</span><span>${dm(points[points.length - 1].day)}</span></div>`;
}

function viewHistory() {
  let h = `<header class="top"><h1>Verlauf</h1>${syncChip()}</header>
    <div class="seg wide">${[['ex', 'Übungen'], ['sess', 'Einheiten']].map(([k, l]) => `<button class="${ui.histMode === k ? 'on' : ''}" data-a="histMode" data-v="${k}">${l}</button>`).join('')}</div>
    <p class="muted small">Es zählt der Verlauf über Wochen, nicht die einzelne Einheit.</p>`;
  if (ui.histMode === 'sess') return h + viewSessionLog();
  if (!ui.histEx) {
    return h + `<div class="list">${allExercises().map(e => {
      const last = exHistory(e.n)[0];
      return `<button class="item" data-a="histEx" data-v="${esc(e.n)}"><span>${esc(e.n)}</span><span class="muted small">${last ? dm(last.day) : '–'}</span></button>`;
    }).join('')}</div>`;
  }
  const ex = exInfo(ui.histEx);
  const hist = exHistory(ex.n, ui.histShift);
  const pts = hist.slice().reverse().map(g => ex.bw || ex.sek
    ? { day: g.day, y: Math.max(...g.sets.map(s => Number(s.r) || 0)), unit: ex.sek ? 's' : 'Wdh.' }
    : { day: g.day, y: Math.max(...g.sets.map(s => Number(s.w) || 0)), unit: 'kg' });
  h += `<button class="btn ghost small" data-a="histEx" data-v="">‹ Alle Übungen</button><h2>${esc(ex.n)}</h2>
    <div class="seg wide">${['frueh', 'spaet'].map(s => `<button class="${ui.histShift === s ? 'on' : ''}" data-a="histShift" data-v="${s}">${SHIFT[s]}schicht</button>`).join('')}</div>`;
  h += `<section class="card">${chart(pts) || '<p class="muted small">Noch zu wenig Einträge für eine Kurve.</p>'}<p class="muted small">${ex.bw || ex.sek ? 'Beste Wdh./Sek. pro Einheit' : 'Höchstes Gewicht pro Einheit'}</p></section>`;
  h += hist.length ? hist.map(g => `<section class="card"><div class="row between"><b>${fmt(g.day)}</b>${g.notfall ? '<span class="tag">Notfallmodus</span>' : ''}${topReached(g.sets, ex) ? '<span class="tag ok">obere Grenze ✓</span>' : ''}</div>
    <div>${g.sets.map(s => setStr(s, ex)).join(' · ')}</div></section>`).join('') : `<p class="muted">Noch keine Einträge in der ${SHIFT[ui.histShift]}schicht.</p>`;
  return h;
}

function viewSessionLog() {
  const all = sessions().slice().reverse();
  if (!all.length) return '<p class="muted">Noch keine Einheiten.</p>';
  const weeks = new Map();
  for (const s of all) { const m = monday(s.day); if (!weeks.has(m)) weeks.set(m, []); weeks.get(m).push(s); }
  return [...weeks].map(([m, list]) => {
    const pf = PFLICHT.filter(t => list.some(s => s.data.type === t && s.data.status === 'fertig')).length;
    return `<section class="card"><div class="row between"><b>Woche ab ${dm(m)} · ${SHIFT[shiftOf(m)]}</b><span class="muted small">Pflicht ${pf}/3</span></div>
      ${list.map(s => {
        const st = s.data.status;
        const tag = st === 'uebersprungen' ? `<span class="tag">${UNITS[s.data.type].kind === 'kampf' ? 'weggelassen' : 'übersprungen'}</span>` : st === 'aktiv' ? '<span class="tag">offen</span>' : '<span class="tag ok">erledigt</span>';
        return `<button class="item" data-a="open" data-v="${s.id}"><span>${fmt(s.day)} · ${esc(unitName(s.data.type))}${s.data.notfall ? ' · Notfall' : ''}${s.data.feel ? ' · ' + s.data.feel : ''}</span>${tag}</button>`;
      }).join('')}</section>`;
  }).join('');
}

// ---------- Export ----------
function exportRows(from, to) {
  const rows = [['Datum', 'Schicht', 'Einheit', 'Status', 'Übung', 'Satz', 'Gewicht kg', 'Wdh./Sek.', 'Notfall', 'Gefühl']];
  for (const s of sessions().filter(s => s.day >= from && s.day <= to)) {
    const base = [s.day, SHIFT[s.data.shift], unitName(s.data.type), s.data.status];
    const sets = setsOf(s.id);
    if (sets.length) for (const x of sets) rows.push([...base, x.data.ex, x.data.no, x.data.w, x.data.r, s.data.notfall ? 'ja' : 'nein', s.data.feel || '']);
    else rows.push([...base, '', '', '', '', s.data.notfall ? 'ja' : 'nein', s.data.feel || '']);
  }
  return rows;
}
const toCsv = rows => rows.map(r => r.map(v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\n');
function exportText() {
  const { from, to } = exRange();
  return `Fitness-Export ${dm(from)}${from.slice(0, 4)} – ${dm(to)}${to.slice(0, 4)} (Status: fertig / uebersprungen / aktiv)\n` + toCsv(exportRows(from, to));
}
function exRange() { return { from: ui.exFrom || addDays(today(), -27), to: ui.exTo || today() }; }
function markExport() { S.put('settings', 'settings', null, { ...settings(), lastExport: today() }); }

function viewMore() {
  const { from, to } = exRange();
  const last = settings().lastExport;
  const due = !last || daysBetween(last, today()) >= 28;
  let h = `<header class="top"><h1>Export & Mehr</h1>${syncChip()}</header>
    <section class="card"><b>Export (alle 4 Wochen)</b>
    <p class="muted small">${last ? `Letzter Export: ${dm(last)} (vor ${daysBetween(last, today())} Tagen).` : 'Noch kein Export.'}${due ? ' Ein Export ist fällig.' : ''}</p>
    <div class="grid2"><label class="field">Von<input type="date" data-ex="from" value="${from}"></label><label class="field">Bis<input type="date" data-ex="to" value="${to}"></label></div>
    <button class="btn big" data-a="exCopy">Als Text kopieren</button>
    <div class="grid2"><button class="btn ghost" data-a="exShare">Teilen</button><button class="btn ghost" data-a="exCsv">CSV-Datei</button></div>
    <p class="muted small">Text in den Trainings-Chat mit Claude einfügen.</p>
    <textarea readonly rows="6" class="preview">${esc(exportText())}</textarea></section>`;
  h += `<section class="card"><b>Wochenplan mit Kickboxen ab</b><label class="field"><input type="date" data-a2="kickStart" value="${settings().kickStart || '2026-12-01'}"></label>
    <p class="muted small">Ab diesem Datum gilt die Dezember-Struktur aus dem Plan.</p></section>`;
  h += `<section class="card"><b>Daten</b><p class="muted small">${S.pending()} Einträge warten auf Übertragung.${S.lastSync() ? ' Letzter Abgleich: ' + new Date(S.lastSync()).toLocaleString('de-DE') : ''}</p>
    <button class="btn ghost" data-a="sync">Jetzt synchronisieren</button>
    ${authed ? '<button class="btn ghost" data-a="logout">Abmelden</button>' : '<button class="btn ghost" data-a="relogin">Anmelden</button>'}</section>
    <p class="muted small center">Version 1 · Ernährung folgt in Version 2</p>`;
  return h;
}

// ---------- Login ----------
function renderLogin() {
  // Registrierung ist in Supabase gesperrt; das eine Konto wird im Supabase-Dashboard angelegt.
  $app.innerHTML = `<main class="page login"><h1>Fitness</h1><p class="muted">Anmelden</p>
    <form id="auth"><label class="field">E-Mail<input type="email" name="email" autocomplete="username" required></label>
    <label class="field">Passwort<input type="password" name="pw" autocomplete="current-password" required></label>
    <button class="btn big" type="submit">Anmelden</button></form>
    <p class="msg">${esc(ui.authMsg)}</p>
    ${!navigator.onLine ? '<p class="muted small">Für die erste Anmeldung braucht das Handy Internet.</p>' : ''}
    ${S.owner() ? '<button class="btn ghost small" data-a="loginBack">Ohne Anmeldung weiter</button>' : ''}</main>`;
}

async function submitAuth(form) {
  if (!client) { ui.authMsg = 'Keine Verbindung zum Server konfiguriert.'; return render(); }
  const email = form.email.value.trim(), pw = form.pw.value;
  ui.authMsg = '…'; renderLoginMsg();
  const res = await client.auth.signInWithPassword({ email, password: pw });
  if (res.error) { ui.authMsg = res.error.message === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch.' : res.error.message; return renderLoginMsg(); }
  onSession(res.data.session);
}
function renderLoginMsg() { const m = document.querySelector('.msg'); if (m) m.textContent = ui.authMsg; }

function onSession(session) {
  if (!session) return;
  authed = true;
  ui.forceLogin = false;
  S.setOwner(session.user.id);
  S.setClient(client, session.user.id);
  ui.authMsg = '';
  render();
  S.sync();
}

// ---------- Aktionen ----------
const actions = {
  tab: v => { ui.tab = v; ui.histEx = null; window.scrollTo(0, 0); },
  shift: v => setShift(today(), v),
  start: v => start(v),
  open: v => openSession(v),
  back: () => { ui.session = null; ui.rest = null; },
  skip: v => {
    const id = createSession(v, 'uebersprungen');
    S.patch(id, { skippedAt: new Date().toISOString() });
  },
  unskip: v => S.remove(v),
  supp: v => {
    const day = today(), r = S.get('supp:' + day);
    const checked = { ...(r?.data.checked || {}) };
    checked[v] = !checked[v];
    S.put('supp:' + day, 'supp_day', day, { checked });
  },
  suppEdit: () => { ui.suppEdit = true; ui.suppDraft = suppList().map(x => ({ ...x })); },
  suppAdd: () => { ui.suppDraft.push({ id: 'i' + Date.now(), name: '', dose: '', time: '' }); S.put('supplements', 'supplements', null, { items: ui.suppDraft }); },
  suppDel: v => { ui.suppDraft[Number(v)].off = true; S.put('supplements', 'supplements', null, { items: ui.suppDraft }); },
  suppSave: () => { S.put('supplements', 'supplements', null, { items: ui.suppDraft.filter(x => x.off || x.name.trim()) }); ui.suppEdit = false; },
  notfall: () => { const s = S.get(ui.session); S.patch(s.id, { notfall: !s.data.notfall }); },
  step: (v, el) => {
    const s = S.get(ui.session), ex = UNITS[s.data.type].ex[v], d = draftFor(s, v, ex);
    const f = el.dataset.f, step = Number(el.dataset.d);
    const cur = Number(String(d[f]).replace(',', '.')) || 0;
    d[f] = Math.max(0, Math.round((cur + step) * 100) / 100);
  },
  setSave: v => {
    const s = S.get(ui.session), ex = UNITS[s.data.type].ex[v], d = draftFor(s, v, ex);
    const w = Number(String(d.w).replace(',', '.')) || 0, r = Number(String(d.r).replace(',', '.')) || 0;
    if (!r) { ui.modal = { title: 'Wiederholungen fehlen', lines: ['Bitte Wdh. eintragen.'] }; return; }
    const no = setsOf(s.id).filter(x => x.data.ex === ex.n).length + 1;
    S.put('x:' + S.uuid(), 'set', s.day, { session: s.id, type: s.data.type, ex: ex.n, no, w, r, shift: s.data.shift });
    ui.rest = { at: Date.now(), c: !!ex.c };
  },
  setDel: v => {
    const r = S.get(v);
    S.remove(v);
    setsOf(r.data.session).filter(x => x.data.ex === r.data.ex).forEach((x, i) => { if (x.data.no !== i + 1) S.patch(x.id, { no: i + 1 }); });
  },
  setsMinus: v => { const s = S.get(ui.session), ex = UNITS[s.data.type].ex[v]; const cur = s.data.sets?.[v] ?? ex.s; S.patch(s.id, { sets: { ...s.data.sets, [v]: Math.max(1, cur - 1) } }); },
  setsPlus: v => { const s = S.get(ui.session), ex = UNITS[s.data.type].ex[v]; const cur = s.data.sets?.[v] ?? ex.s; S.patch(s.id, { sets: { ...s.data.sets, [v]: cur + 1 } }); },
  exSkip: v => { const s = S.get(ui.session); S.patch(s.id, { skip: [...(s.data.skip || []), Number(v)] }); },
  exUnskip: v => { const s = S.get(ui.session); S.patch(s.id, { skip: (s.data.skip || []).filter(x => x !== Number(v)) }); },
  restClose: () => { ui.rest = null; },
  finish: () => {
    const s = S.get(ui.session);
    S.patch(s.id, { status: 'fertig', finishedAt: new Date().toISOString() });
    ui.session = null; ui.rest = null; ui.tab = 'heute';
    stopTimer();
  },
  reopen: () => S.patch(ui.session, { status: 'aktiv' }),
  discard: () => {
    ui.modal = { title: 'Einheit löschen?', lines: ['Alle Sätze dieser Einheit werden entfernt.'], ok: 'Löschen', onOk: () => {
      setsOf(ui.session).forEach(x => S.remove(x.id)); S.remove(ui.session); ui.session = null; stopTimer();
    } };
  },
  blockItem: v => { const s = S.get(ui.session); S.patch(s.id, { blocks: { ...s.data.blocks, [v]: !s.data.blocks?.[v] } }); },
  blockAll: v => {
    const s = S.get(ui.session), bl = KAMPF[s.data.type].find(x => x.key === v);
    const b = { ...s.data.blocks }, on = !bl.items.every((_, j) => b[v + j]);
    bl.items.forEach((_, j) => (b[v + j] = on));
    S.patch(s.id, { blocks: b });
  },
  feel: v => { const s = S.get(ui.session); S.patch(s.id, { feel: s.data.feel === v ? null : v }); },
  timerOpen: v => timerOpen(v),
  timerToggle: () => timerToggle(),
  timerSkip: () => timerNext(false),
  timerClose: () => stopTimer(),
  histMode: v => { ui.histMode = v; },
  histEx: v => { ui.histEx = v || null; window.scrollTo(0, 0); },
  histShift: v => { ui.histShift = v; },
  exCopy: async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(exportText()); ok = true; }
    catch { const t = document.querySelector('.preview'); t.select(); ok = document.execCommand('copy'); }
    if (ok) markExport();
    ui.modal = ok ? { title: 'Kopiert', lines: ['In den Trainings-Chat einfügen.'] } : { title: 'Kopieren ging nicht', lines: ['Bitte "Teilen" oder "CSV-Datei" nutzen.'] };
  },
  exShare: async () => {
    const text = exportText();
    if (navigator.share) { try { await navigator.share({ title: 'Fitness-Export', text }); markExport(); } catch { /* abgebrochen */ } }
    else actions.exCopy();
  },
  exCsv: () => {
    const { from, to } = exRange();
    const blob = new Blob(['﻿' + toCsv(exportRows(from, to))], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `fitness-export_${from}_${to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    markExport();
  },
  sync: () => S.sync(),
  logout: async () => { await client?.auth.signOut(); authed = false; S.clearClient(); },
  loginBack: () => { ui.forceLogin = false; },
  relogin: () => { ui.forceLogin = true; renderLogin(); },
  modalOk: () => { const m = ui.modal; ui.modal = null; m.onOk?.(); },
  modalClose: () => { ui.modal = null; },
};
function stopTimer() { clearInterval(tick); wake?.release?.(); wake = null; ui.timer = null; }

function modal() {
  const m = ui.modal;
  return `<div class="overlay"><div class="dialog"><h3>${esc(m.title)}</h3>${m.lines.map(l => `<p>${esc(l)}</p>`).join('')}
    <div class="grid2">${m.ok ? `<button class="btn ghost" data-a="modalClose">Abbrechen</button><button class="btn" data-a="modalOk">${esc(m.ok)}</button>` : `<button class="btn" data-a="modalClose">OK</button>`}</div></div></div>`;
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const fn = actions[el.dataset.a];
  if (!fn) return;
  e.preventDefault();
  const keepTimer = ['timerToggle', 'timerSkip'].includes(el.dataset.a);
  await fn(el.dataset.v, el);
  if (keepTimer) return;
  if (el.dataset.a === 'relogin') return;
  render();
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.draft !== undefined) {
    const s = S.get(ui.session), ex = UNITS[s.data.type].ex[el.dataset.draft];
    draftFor(s, el.dataset.draft, ex)[el.dataset.f] = el.value;
  } else if (el.dataset.supp !== undefined) {
    ui.suppDraft[el.dataset.supp][el.dataset.f] = el.value;
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.ex) { ui['ex' + (el.dataset.ex === 'from' ? 'From' : 'To')] = el.value; render(); }
  else if (el.dataset.a2 === 'kickStart' && el.value) S.put('settings', 'settings', null, { ...settings(), kickStart: el.value });
  else if (el.dataset.supp !== undefined && ui.suppDraft) S.put('supplements', 'supplements', null, { items: ui.suppDraft });
});
document.addEventListener('submit', e => { if (e.target.id === 'auth') { e.preventDefault(); submitAuth(e.target); } });

// Neu zeichnen bei Datenänderung, ohne laufende Eingaben zu stören
S.onChange(() => {
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'date') {
    document.querySelectorAll('.chip').forEach(c => (c.outerHTML = syncChip()));
    return;
  }
  if (!ui.forceLogin) render();
});
addEventListener('online', () => { S.sync(); render(); });
addEventListener('offline', () => render());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { S.sync(); if (!document.activeElement || document.activeElement === document.body) render(); } });

// ---------- Start ----------
async function boot() {
  const cfg = window.FIT_CONFIG || {};
  if (DEV) { S.setOwner('dev'); return render(); }
  if (cfg.url && cfg.key && window.supabase) {
    client = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'fit.auth' } });
    client.auth.onAuthStateChange((ev, session) => {
      if (session) { authed = true; S.setClient(client, session.user.id); if (ui.forceLogin) { ui.forceLogin = false; } }
      if (ev === 'SIGNED_OUT') { authed = false; S.clearClient(); }
    });
  }
  render();
  if (!client) return;
  const { data } = await client.auth.getSession().catch(() => ({ data: {} }));
  authChecked = true;
  if (data?.session) onSession(data.session);
  else render();
}
boot();

if ('serviceWorker' in navigator && !location.search.includes('nosw')) navigator.serviceWorker.register('./sw.js').catch(() => {});
