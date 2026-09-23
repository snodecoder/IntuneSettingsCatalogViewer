/**
 * csp-path-check.ts
 *
 * Self-check for buildCspPath (src/lib/types.ts).
 *
 * offsetUri is an absolute path off baseUri and almost always already starts
 * with "/" in the real catalog data, so naively joining with
 * `${baseUri}/${offsetUri}` produces a double slash. buildCspPath only
 * inserts a "/" when offsetUri is non-empty and doesn't already start with one.
 *
 * Usage:
 *   npx tsx scripts/csp-path-check.ts
 */

import * as assert from 'assert';
import { buildCspPath } from '../src/lib/types';

// offsetUri already starts with "/" — must not double it up.
assert.strictEqual(buildCspPath('./Device/Vendor/MSFT/Policy/Config', '/Foo/Bar'), './Device/Vendor/MSFT/Policy/Config/Foo/Bar');

// offsetUri without a leading "/" still needs one inserted.
assert.strictEqual(buildCspPath('./Device/Vendor/MSFT/Policy/Config', 'Foo/Bar'), './Device/Vendor/MSFT/Policy/Config/Foo/Bar');

// Only one of the two present.
assert.strictEqual(buildCspPath('./Device/Vendor/MSFT/Policy/Config', undefined), './Device/Vendor/MSFT/Policy/Config');
assert.strictEqual(buildCspPath(undefined, '/Foo/Bar'), '/Foo/Bar');

// Neither present.
assert.strictEqual(buildCspPath(undefined, undefined), '');

// Empty-string offsetUri behaves like "not present".
assert.strictEqual(buildCspPath('./Device/Vendor/MSFT/Policy/Config', ''), './Device/Vendor/MSFT/Policy/Config');

console.log('buildCspPath: OK');
