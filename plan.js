// Inhalte 1:1 aus plan.md und kontext/kickboxen-einheiten.md. Nicht umbauen.
// s = Sätze, r = Wdh.-Bereich [min, max], bw = Körpergewicht (Gewicht = Zusatzgewicht),
// sek = Sekunden statt Wdh., c = schwere Verbundübung (Pause 2-3 Min, sonst 1,5-2 Min).

export const UNITS = {
  push: { name: 'Push', kind: 'kraft', ex: [
    { n: 'Schrägbankdrücken', s: 3, r: [8, 10], c: true },
    { n: 'Schulterdrücken', s: 3, r: [8, 10], c: true },
    { n: 'Dips', s: 3, r: [8, 12], c: true, bw: true },
    { n: 'Butterfly', s: 3, r: [10, 15] },
    { n: 'Seitheben', s: 3, r: [12, 15] },
    { n: 'Overhead Trizepsseil', s: 3, r: [12, 15] },
  ] },
  pull: { name: 'Pull', kind: 'kraft', ex: [
    { n: 'Klimmzüge', s: 4, r: [8, 10], c: true, bw: true },
    { n: 'Breites Rudern', s: 3, r: [8, 10], c: true },
    { n: 'Reverse Butterfly', s: 3, r: [15, 15] },
    { n: 'Überzüge (Pullover)', s: 3, r: [10, 15] },
    { n: 'Kabelcurls', s: 3, r: [10, 12] },
    { n: 'Hammercurls', s: 3, r: [10, 12] },
  ] },
  beine: { name: 'Beine', kind: 'kraft', ex: [
    { n: 'Kreuzheben', s: 3, r: [5, 6], c: true },
    { n: 'Beinpresse', s: 3, r: [6, 10], c: true },
    { n: 'Hip Thrust', s: 3, r: [8, 12], c: true },
    { n: 'Beinbeuger', s: 3, r: [8, 12] },
    { n: 'Beinstrecker', s: 3, r: [8, 12] },
    { n: 'Waden', s: 3, r: [15, 20] },
    { n: 'Hanging Leg Raises', s: 3, r: [10, 15], bw: true },
  ] },
  ok_a: { name: 'Oberkörper A (Gym)', kind: 'kraft', ex: [
    { n: 'Schrägbankdrücken', s: 3, r: [8, 10], c: true },
    { n: 'Klimmzüge', s: 3, r: [8, 10], c: true, bw: true },
    { n: 'Butterfly', s: 3, r: [15, 15] },
    { n: 'Rudern eng', s: 3, r: [10, 12], c: true },
    { n: 'Seitheben', s: 3, r: [12, 15] },
    { n: 'Bizeps Seil', s: 3, r: [10, 12] },
    { n: 'Overhead Trizeps', s: 3, r: [10, 12] },
  ] },
  ok_b: { name: 'Oberkörper B (Calisthenics)', kind: 'kraft', note: 'E-Gym-Zirkel optional davor. Keine Pike Push-ups.', ex: [
    { n: 'Klimmzüge', s: 4, c: true, bw: true },
    { n: 'Dips', s: 4, c: true, bw: true },
    { n: 'Inverted Rows', s: 3, bw: true },
    { n: 'Liegestütze auf Fäusten', s: 3, bw: true },
    { n: 'Leg Raises', s: 3, bw: true },
    { n: 'Diamond Push-ups', s: 3, bw: true },
    { n: 'Dead Hang', s: 2, bw: true, sek: true, hint: '20-40 Sek.' },
  ] },
  zirkel: { name: 'Kickbox-Zirkel', kind: 'kampf' },
  technik: { name: 'Technik allein', kind: 'kampf' },
  kickboxen: { name: 'Kickboxen (Studio/Sparring)', kind: 'kampf' },
};

export const PICK = ['push', 'pull', 'beine', 'ok_a', 'ok_b', 'zirkel', 'technik', 'kickboxen'];
export const PFLICHT = ['push', 'pull', 'beine'];

// Reihe: Push -> Pull -> Beine -> Oberkörper. Ab Dezember in der Frühschicht-Woche Pull -> Push -> Beine -> Oberkörper.
export function order(phase, shift) {
  return phase === 'dez' && shift === 'frueh' ? ['pull', 'push', 'beine', 'ok'] : ['push', 'pull', 'beine', 'ok'];
}

// Wochenstruktur, Index 0 = Montag. main = Standardvorschlag, opt = optional.
export const WEEK = {
  vor: {
    frueh: [{}, { main: 'push' }, { main: 'pull' }, { opt: ['zirkel'] }, { main: 'beine' }, { opt: ['zirkel'] }, { main: 'ok' }],
    spaet: [{ main: 'zirkel' }, { main: 'push' }, { main: 'pull' }, {}, { main: 'beine' }, {}, { main: 'ok' }],
  },
  dez: {
    frueh: [{ main: 'kickboxen', label: 'Sparring' }, { main: 'kickboxen' }, { main: 'pull' }, { main: 'push' }, { main: 'beine' }, { opt: ['kickboxen'], label: 'Kickboxen (optional)' }, { main: 'ok' }],
    spaet: [{ main: 'zirkel' }, { main: 'push' }, { main: 'pull' }, { main: 'technik' }, { main: 'beine' }, { main: 'kickboxen' }, { main: 'ok' }],
  },
};

const AUFWAERMEN_Z = ['2 Min Seilspringen', '10 Armkreise vor/zurück', '10 Hüftkreise je Seite', '10 Kniebeugen + Armstreckung', '2 Min lockeres Schattenboxen'];
const COOLDOWN = ['1 Min lockeres Schattenboxen', '2 Min Bein- und Hüftdehnung', '1 Min Brust und Schulter dehnen', '1 Min Rücken dehnen (z. B. Kindhaltung)'];
const STATIONEN = [
  'Boxsack: Jab-Cross-Kombination, hohes Tempo', 'Push-Ups explosiv', 'Boxsack: Low Kick li/re im Wechsel',
  'Kettlebell Squats mit Push', 'Boxsack: 3er-Kombo (Jab-Cross-Hook)', 'Box Jumps', 'Boxsack: Front Kick, beidseitig',
  'Kettlebell Swings', 'Burpees', 'Schattenboxen, freie Kombinationen, volle Bewegung',
];
const TECHNIK = [
  '5 Min Stand & Bewegung: Grundstellung, Vor-/Zurücksteppen, Pivot',
  '5 Min Grundschläge am Boxsack: Jab, Cross, Hook, Uppercut',
  '5 Min Grundtritte am Boxsack: Front Kick, Low Kick, Roundhouse',
];
const KOMBIS = [
  'Boxsack: Jab-Cross-Hook (Technik, moderates Tempo)', 'Boxsack: Low Kick-Cross-Low Kick',
  'Boxsack: Jab-Cross-Low Kick-Hook (4er-Kombo)', 'Schattenboxen: freie Kombinationen',
];

function zirkelPhasen() {
  const p = [];
  for (let r = 1; r <= 3; r++) {
    STATIONEN.forEach((st, i) => {
      p.push({ label: st, sec: 45, work: true, info: `Runde ${r}/3 · Station ${i + 1}/10` });
      if (i < 9) p.push({ label: 'Pause', next: STATIONEN[i + 1], sec: 15, info: `Runde ${r}/3` });
      else if (r < 3) p.push({ label: 'Rundenpause', next: STATIONEN[0], sec: 90, info: `nach Runde ${r}/3` });
    });
  }
  return p;
}
function kombiPhasen() {
  const p = [];
  KOMBIS.forEach((k, i) => {
    p.push({ label: k, sec: 120, work: true, info: `Runde ${i + 1}/4` });
    if (i < 3) p.push({ label: 'Pause', next: KOMBIS[i + 1], sec: 60, info: `nach Runde ${i + 1}/4` });
  });
  return p;
}
function technikPhasen() {
  return TECHNIK.map((t, i) => ({ label: t.replace(/^5 Min /, ''), sec: 300, work: true, info: `Teil ${i + 1}/3` }));
}

export const KAMPF = {
  zirkel: [
    { key: 'auf', title: 'Aufwärmen (10-15 Min)', items: AUFWAERMEN_Z },
    { key: 'zirkel', title: 'Zirkel: 3 Runden, 45 Sek / 15 Sek, 90 Sek Rundenpause', items: STATIONEN, timer: zirkelPhasen },
    { key: 'cool', title: 'Cooldown & Dehnung (5-10 Min)', items: COOLDOWN },
  ],
  technik: [
    { key: 'auf', title: 'Aufwärmen (10 Min)', items: ['2 Min Seilspringen', '10 Armkreise vor/zurück', '10 Hüftkreise je Seite', '1 Min lockeres Schattenboxen'] },
    { key: 'tech', title: 'Technikblock (15 Min)', items: TECHNIK, timer: technikPhasen },
    { key: 'kombi', title: 'Kombinationen: 4 Runden, 2 Min / 1 Min Pause', items: KOMBIS, timer: kombiPhasen },
    { key: 'cool', title: 'Cooldown & Dehnung (5-10 Min)', items: COOLDOWN },
  ],
  kickboxen: [],
};

// Alle Kraftübungen in Plan-Reihenfolge (für den Verlauf).
export function allExercises() {
  const seen = new Map();
  for (const k of ['push', 'pull', 'beine', 'ok_a', 'ok_b']) for (const e of UNITS[k].ex) if (!seen.has(e.n)) seen.set(e.n, e);
  return [...seen.values()];
}
