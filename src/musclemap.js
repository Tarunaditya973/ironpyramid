export function regionIdsFor(muscles) {
  const ids = [];
  for (const m of muscles) {
    ids.push(`f-${m}`, `b-${m}`, `f-${m}-r`, `b-${m}-r`);
  }
  return ids;
}

export function highlightMuscles(svgRoot, { primary = [], secondary = [] }) {
  svgRoot.querySelectorAll('.primary, .secondary').forEach(el =>
    el.classList.remove('primary', 'secondary'));
  for (const id of regionIdsFor(secondary)) {
    const el = svgRoot.getElementById(id);
    if (el) el.classList.add('secondary');
  }
  for (const id of regionIdsFor(primary)) {
    const el = svgRoot.getElementById(id);
    if (el) el.classList.add('primary'); // primary wins over secondary
  }
}
