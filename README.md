# versionbisect

Find the npm release where a bug reproduction's output changed.

> **Early prototype.** The CLI works on short reproductions, but it has only been tried on a handful of real bugs. **It is not a sandbox:** the reproduction runs on your machine, so only run code you have read.

## Example

A [Hono issue](https://github.com/honojs/hono/issues/5544) reported a bug on version 4.13.13. Running its reproduction across releases shows when the output changed:

```console
$ node src/cli.mjs hono examples/hono-5544.mjs --good 4.0.0 --bad 4.13.13
Output changed at hono@4.1.4 (last unchanged: 4.1.3)
  before: {"code":0,"stdout":"yes","error":""}
  after:  {"code":0,"stdout":"null","error":""}
Tested 11 of 195 versions in 28s
This shows when the output changed, not whether the change is a bug.
```

## Usage

Requires Node.js 20 or newer. There are no dependencies to install, and the package is not on npm yet.

```bash
git clone https://github.com/satriadaffa/versionbisect.git
cd versionbisect
node src/cli.mjs <package> <repro.mjs> --good <version> [--bad <version>] [--sweep]
```

| Option | Meaning |
|---|---|
| `--good` | Oldest version to test |
| `--bad` | Newest version to test (default: latest stable) |
| `--sweep` | Test every version in the range instead of searching |

A reproduction is an ES module that imports the package and prints its result:

```js
import { z } from 'zod';

const schema = z.union([z.array(z.string()).max(2), z.string()]);
const result = schema.safeParse(['a', 'b', 'c']);
console.log(result.error?.issues.map(({ code, origin, path }) => ({ code, origin, path })));
```

No assertion is needed, because versions are compared by exit status, stdout, and error message.

## How it works

1. Reads the published stable versions in the range from npm.
2. Installs each tested version into a temporary folder, with install scripts turned off.
3. Runs the reproduction and records its result.
4. Checks a few evenly spaced versions, then binary searches for the first version that differs.
5. Repeats the versions around the change, and reports the result as unstable if they differ.

## Results so far

| Case | Result | Compared with |
|---|---|---|
| [zod#6659](https://github.com/colinhacks/zod/issues/6659), 4.6.5 to 4.6.6 | Changed at 4.6.6 | Matches the issue |
| [zod#6545](https://github.com/colinhacks/zod/issues/6545), 4.4.3 to 4.5.4 | Changed at 4.5.0 | Matches the issue |
| zod#6659, 4.0.0 to 4.6.6 | Changed at 4.0.6, with a warning about further changes | A full sweep of 57 versions found changes at 4.0.6 and 4.6.6 |
| [hono#5544](https://github.com/honojs/hono/issues/5544), 4.0.0 to 4.13.13 | Changed at 4.1.4 | A full sweep of 4.0.0 to 4.2.0 agrees |
| [valibot#436](https://github.com/open-circle/valibot/issues/436), 0.20.1 to 0.28.1 | Changed at 0.22.0 | A full sweep of 12 versions agrees |
| [defu#119](https://github.com/unjs/defu/issues/119), 6.1.2 to 6.1.3 (reproduction rewritten as one file) | Changed at 6.1.3 | Matches the issue. A full sweep shows the result returned at 6.1.4 |
| Stable control | No change found | Expected |
| Random output control | Reported as unstable | Expected |

This is a small sample, not a benchmark. The reproductions are in [`examples/`](examples/).

## Limitations

- **It finds a changed output, not a bug.** The change may be intentional, or unrelated to the problem you care about. Narrow the range if a wide one finds something else.
- **It can miss changes.** It assumes the checked versions are representative, so behaviour that appears and disappears between two checked versions can be missed. Use `--sweep` to test everything.
- **Noisy output looks like a change.** Timestamps, random values, and changed error wording all count.
- **Older versions may not fit.** A missing export or module counts as a different result, and it may not be the bug.
- **Type-only bugs are invisible.** TypeScript types are erased at runtime, so a regression that only shows up in `tsc` produces no change here.
- **Limited scope for now.** Single-file Node.js reproductions only, with no browser support and no reproduction repositories.

## Security

The reproduction runs with your user's permissions. The tool clears most environment variables, turns off install scripts, and sets a time limit, but none of that makes it safe for untrusted code. Dependencies still come from npm, and the code has access to your files and network.

Please report security problems privately through GitHub's private vulnerability reporting rather than in a public issue.

## Roadmap

These depend on whether maintainers find the idea useful:

- A GitHub Action with a maintainer-only `/bisect` command, running reproductions in a job with no token or secrets
- An open benchmark of regressions with known versions
- An `--expect-output` option to follow one specific bug

## Feedback

Would this help you triage issues? If not, what would stop you from using it? Please [open an issue](../../issues), including if the answer is "not useful".

## License

[MIT](LICENSE)
