export const MUSCLE_KEYS = [
  'chest', 'front-delts', 'side-delts', 'rear-delts', 'traps', 'lats',
  'mid-back', 'lower-back', 'biceps', 'triceps', 'forearms', 'abs',
  'obliques', 'glutes', 'quads', 'hamstrings', 'calves', 'cardio',
];

// Each token from the raw string is scanned for these keyword rules, in order.
// A rule matches if its `kw` appears in the (punctuation-stripped) token.
const RULES = [
  { kw: 'front delt', keys: ['front-delts'] },
  { kw: 'side delt', keys: ['side-delts'] },
  { kw: 'rear delt', keys: ['rear-delts'] },
  { kw: 'shoulder', keys: ['front-delts', 'side-delts'] },
  // Bare "delt" defaults to front delts, but only when no qualified delt
  // term (front/side/rear) already matched this token — mirrors the
  // bareBack guard below.
  { kw: 'delt', keys: ['front-delts'], bareDelt: true },
  { kw: 'tricep', keys: ['triceps'] },
  { kw: 'bicep', keys: ['biceps'] },
  { kw: 'forearm', keys: ['forearms'] },
  { kw: 'trap', keys: ['traps'] },
  { kw: 'lat', keys: ['lats'] },
  { kw: 'rhomboid', keys: ['mid-back'] },
  { kw: 'upper back', keys: ['mid-back'] },
  { kw: 'mid-back', keys: ['mid-back'] },
  { kw: 'mid back', keys: ['mid-back'] },
  { kw: 'lower back', keys: ['lower-back'] },
  { kw: 'chest', keys: ['chest'] },
  { kw: 'oblique', keys: ['obliques'] },
  { kw: 'core', keys: ['abs'] },
  { kw: 'ab', keys: ['abs'], wordBoundary: true },
  { kw: 'glute', keys: ['glutes'] },
  { kw: 'quad', keys: ['quads'] },
  { kw: 'hamstring', keys: ['hamstrings'] },
  { kw: 'calf', keys: ['calves'] },
  { kw: 'calves', keys: ['calves'] },
  { kw: 'cardio', keys: ['cardio'] },
  // Bare "back" (deadlift-style) lights the whole posterior back. Checked last
  // so qualified terms above win; guarded so it only fires when no qualified
  // back term already matched this token.
  { kw: 'back', keys: ['lats', 'mid-back', 'lower-back'], bareBack: true },
];

function tokenize(raw) {
  // split on ; , / ( ) and normalize whitespace/case
  return raw
    .replace(/[()]/g, ' ')
    .split(/[;,/]/)
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeMuscles(raw) {
  if (!raw) return [];
  const found = new Set();
  for (const token of tokenize(raw)) {
    const clean = token.replace(/[^a-z\s-]/g, ' ');
    const qualifiedBack = /(mid|lower|upper)\s*-?\s*back/.test(clean);
    const qualifiedDelt = /(front|side|rear)\s*delt/.test(clean);
    for (const rule of RULES) {
      if (rule.bareBack && qualifiedBack) continue; // don't over-light
      if (rule.bareDelt && qualifiedDelt) continue; // don't over-light
      const matches = rule.wordBoundary
        ? new RegExp(`\\b${rule.kw}`).test(clean)
        : clean.includes(rule.kw);
      if (matches) rule.keys.forEach(k => found.add(k));
    }
  }
  return [...found];
}

export function unionMuscles(exercises) {
  const primary = new Set();
  const secondary = new Set();
  for (const ex of exercises) {
    (ex.primary || []).forEach(m => primary.add(m));
    (ex.secondary || []).forEach(m => secondary.add(m));
  }
  return { primary: [...primary], secondary: [...secondary] };
}
