#!/usr/bin/env node
// Finds the npm release where a reproduction's result changes.
// NOT a sandbox. Only run reproductions you have read.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import {
  bisect,
  compareVersions,
  groupRuns,
  isValidPackageName,
  parseVersion,
  versionsInRange,
} from './bisect-core.mjs';

const USAGE = `Usage: versionbisect <package> <repro.mjs> --good <version> [--bad <version>] [--sweep]

  --good   Oldest version to test
  --bad    Newest version to test (default: latest stable)
  --sweep  Test every version in the range instead of searching

This is not a sandbox. Only run reproductions you have read.`;

const EXIT = { usage: 2, unstable: 3, couldNotRun: 4 };
const exec = promisify(execFile);
const isWin = process.platform === 'win32';

function fail(message, code = EXIT.usage) {
  console.error(message);
  process.exit(code);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { good: { type: 'string' }, bad: { type: 'string' }, sweep: { type: 'boolean' } },
  });
} catch (e) {
  fail(`${e.message}\n\n${USAGE}`);
}
const { values: opts, positionals: [pkg, repro] } = parsed;

if (!pkg || !repro || !opts.good) fail(USAGE);
if (!isValidPackageName(pkg)) fail(`Invalid package name: ${pkg}`);
if (!existsSync(repro)) fail(`Reproduction file not found: ${repro}`);
for (const v of [opts.good, opts.bad]) {
  if (v !== undefined && !parseVersion(v)) fail(`Expected a version like 1.2.3, got: ${v}`);
}

const npm = (args, cwd) =>
  exec(isWin ? 'npm.cmd' : 'npm', args, { cwd, shell: isWin, maxBuffer: 2e7, timeout: 180_000 });

const couldNotRun = (reason) => JSON.stringify({ couldNotRun: reason });
const isCouldNotRun = (result) => result.startsWith('{"couldNotRun"');

// Reduces a run to what is comparable between versions: exit status, stdout,
// and the error message, without paths or stack lines that differ per run.
function signature(code, stdout, stderr, dir) {
  const clean = (s) => s.split(dir).join('<tmp>').replaceAll('\r', '').trim();
  const error = clean(stderr).split('\n').find((l) => /^\w*Error\b/.test(l)) ?? '';
  return JSON.stringify({ code, stdout: clean(stdout), error });
}

async function evaluate(version) {
  const dir = await mkdtemp(join(tmpdir(), 'versionbisect-'));
  try {
    await writeFile(join(dir, 'package.json'), '{"private":true,"type":"module"}');
    await copyFile(repro, join(dir, basename(repro)));
    try {
      await npm(['install', `${pkg}@${version}`, '--ignore-scripts', '--no-audit', '--no-fund', '--silent'], dir);
    } catch {
      return couldNotRun(`install failed for ${pkg}@${version}`);
    }
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NO_COLOR: '1' };
    try {
      const r = await exec(process.execPath, [basename(repro)], { cwd: dir, env, timeout: 30_000 });
      return signature(0, r.stdout, r.stderr, dir);
    } catch (e) {
      if (e.killed) return JSON.stringify({ timeout: true });
      return signature(e.code ?? 1, e.stdout ?? '', e.stderr ?? '', dir);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const started = Date.now();
const elapsed = () => Math.round((Date.now() - started) / 1000);

let all;
try {
  const { stdout } = await npm(['view', pkg, 'versions', '--json'], process.cwd());
  all = [JSON.parse(stdout)].flat();
} catch {
  fail(`Could not read versions of ${pkg} from npm.`, EXIT.couldNotRun);
}

const bad = opts.bad ?? all.filter(parseVersion).sort(compareVersions).at(-1);
const versions = versionsInRange(all, opts.good, bad);
if (versions.length < 2) fail(`Need at least 2 published versions between ${opts.good} and ${bad}.`);

if (opts.sweep) {
  const results = [];
  for (const v of versions) results.push(await evaluate(v));
  for (const run of groupRuns(versions, results)) console.log(`${run.from} .. ${run.to}  ${run.result}`);
  console.log(`Tested all ${versions.length} versions in ${elapsed()}s`);
  process.exit(0);
}

const result = await bisect(versions, evaluate);
const summary = `Tested ${result.tested.size} of ${versions.length} versions in ${elapsed()}s`;
const failures = [...result.tested.values()].filter(isCouldNotRun);

if (!result.changed) {
  if (failures.length) fail(`Could not run: ${JSON.parse(failures[0]).couldNotRun}\n${summary}`, EXIT.couldNotRun);
  console.log(`No change found between ${pkg}@${opts.good} and ${pkg}@${bad}\n${summary}`);
  process.exit(0);
}

const boundary = [result.tested.get(result.lastSame), result.tested.get(result.firstChanged)];
const failed = boundary.find(isCouldNotRun);
if (failed) fail(`Could not run: ${JSON.parse(failed).couldNotRun}\n${summary}`, EXIT.couldNotRun);

// Repeat the boundary: an unstable reproduction must not yield a confident answer.
const repeat = [await evaluate(result.lastSame), await evaluate(result.firstChanged)];
if (repeat[0] !== boundary[0] || repeat[1] !== boundary[1]) {
  console.log(`Unstable: the same version gave different output near ${pkg}@${result.firstChanged}\n${summary}`);
  process.exit(EXIT.unstable);
}

console.log(`Output changed at ${pkg}@${result.firstChanged} (last unchanged: ${result.lastSame})`);
console.log(`  before: ${repeat[0]}`);
console.log(`  after:  ${repeat[1]}`);
if (result.returned) console.log('Warning: a later version matched the earlier result again, so there may be several changes.');
if (failures.length) console.log(`Warning: ${failures.length} tested version(s) could not be installed.`);
console.log(summary);
console.log('This shows when the output changed, not whether the change is a bug.');
