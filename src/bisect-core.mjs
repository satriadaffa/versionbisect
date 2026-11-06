// Pure logic, no I/O, so it can be tested without installing anything.
export function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? m.slice(1, 4).map(Number) : null; // pre-releases are skipped
}

// On Windows npm runs through a shell, so package names must never reach it unchecked.
export function isValidPackageName(name) {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name) && name.length <= 214;
}

export function compareVersions(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export function versionsInRange(all, good, bad) {
  return all
    .filter((v) => parseVersion(v))
    .filter((v) => compareVersions(v, good) >= 0 && compareVersions(v, bad) <= 0)
    .sort(compareVersions);
}

// Evenly spaced positions across the list, always including both ends.
export function probePositions(length, probes) {
  const count = Math.min(length, probes);
  const positions = new Set([0, length - 1]);
  for (let i = 1; i < count - 1; i++) positions.add(Math.round((i * (length - 1)) / (count - 1)));
  return [...positions].sort((a, b) => a - b);
}

// Finds the first version whose result differs from the first version in the list.
// Comparing only the two ends misses behaviour that changed and later changed back,
// so a few versions in between are checked first. Changes that fall entirely
// between two checked versions can still be missed.
export async function bisect(versions, evaluate, { probes = 6 } = {}) {
  const tested = new Map();
  const run = async (v) => {
    if (!tested.has(v)) tested.set(v, await evaluate(v));
    return tested.get(v);
  };
  const positions = probePositions(versions.length, probes);
  const results = [];
  for (const p of positions) results.push(await run(versions[p]));
  const baseline = results[0];
  const firstDiff = results.findIndex((r) => r !== baseline);
  if (firstDiff === -1) return { changed: false, tested };
  const returned = results.slice(firstDiff).includes(baseline);
  let lo = positions[firstDiff - 1];
  let hi = positions[firstDiff];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((await run(versions[mid])) === baseline) lo = mid;
    else hi = mid;
  }
  return { changed: true, returned, lastSame: versions[lo], firstChanged: versions[hi], tested };
}

// Groups a full sweep into runs of versions that gave the same result.
export function groupRuns(versions, results) {
  const runs = [];
  versions.forEach((version, i) => {
    const current = runs.at(-1);
    if (current && current.result === results[i]) current.to = version;
    else runs.push({ from: version, to: version, result: results[i] });
  });
  return runs;
}
