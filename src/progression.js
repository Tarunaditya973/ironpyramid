export function epley1RM(weight, reps) {
  if (!weight) return 0;
  return weight * (1 + reps / 30);
}

export function parseScheme(setType, scheme) {
  const isTimed = /sec|hold|min/i.test(scheme);
  const perLeg = /per leg/i.test(scheme);
  let sets = 0;
  let topReps = null;

  const setsColon = scheme.match(/(\d+)\s*sets?\s*:\s*([\d/]+)/i); // "4 sets: 12/10/8/6"
  const nxr = scheme.match(/(\d+)\s*x\s*([\d-]+)/i);               // "3x15" or "4x12"
  const rounds = scheme.match(/(\d+)\s*rounds?/i);                 // "3 rounds: ..."
  const setsGeneral = scheme.match(/(\d+)\s*sets?\b/i);            // "3 sets x 45 sec hold"

  if (setsColon) {
    sets = Number(setsColon[1]);
    const reps = setsColon[2].split('/').map(Number).filter(n => !isNaN(n));
    topReps = reps.length ? reps[reps.length - 1] : null;
  } else if (nxr) {
    sets = Number(nxr[1]);
    topReps = Number(nxr[2].split('-')[0]);
  } else if (rounds) {
    sets = Number(rounds[1]);
  } else if (setsGeneral) {
    sets = Number(setsGeneral[1]);
  }
  // Timed/hold schemes have no rep target: never suggest adding weight to a plank.
  if (isTimed) topReps = null;
  if (!sets) sets = 3;
  return { sets, topReps, isTimed, perLeg };
}

export function lastSessionForExercise(exId, sessions) {
  const withEx = sessions.filter(s => s.entries.some(e => e.exId === exId));
  if (!withEx.length) return null;
  return withEx.slice().sort((a, b) => a.dateISO < b.dateISO ? 1 : -1)[0];
}

export function prefillSets(exId, sessions, scheme) {
  const { sets } = parseScheme('', scheme);
  const last = lastSessionForExercise(exId, sessions);
  const lastSets = last ? (last.entries.find(e => e.exId === exId).sets) : [];
  const out = [];
  for (let i = 0; i < sets; i++) {
    const prev = lastSets[i] || lastSets[lastSets.length - 1] || { weight: 0, reps: 0 };
    out.push({ weight: prev.weight || 0, reps: prev.reps || 0, done: false });
  }
  return out;
}

export function suggestIncrease(exId, sessions, exercise) {
  const { topReps } = parseScheme(exercise.setType, exercise.scheme);
  const last = lastSessionForExercise(exId, sessions);
  if (!last || topReps == null) return { suggest: false, increment: 0, message: '' };
  const sets = last.entries.find(e => e.exId === exId).sets;
  const top = sets[sets.length - 1];
  if (top && top.reps >= topReps) {
    return {
      suggest: true,
      increment: exercise.increment,
      message: `Hit ${topReps} reps last time → try +${exercise.increment}kg on the top set.`,
    };
  }
  return { suggest: false, increment: 0, message: '' };
}
