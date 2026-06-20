/**
 * Guard against "missing icons" regressions.
 *
 * Admin icons are rendered from the shared library keyed by a string "kind"
 * (see iconLibrary.js). When a page passes a kind that is not in ICON_PATHS /
 * ICON_ALIASES the renderer silently falls back to a generic glyph, so the icon
 * effectively goes missing. This test statically scans the admin render sources
 * for every referenced icon kind and asserts each one resolves, so any unknown
 * or newly-introduced key fails CI before it ships.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { hasIcon } = require("./iconLibrary");

const HTTP_DIR = __dirname;
const BOT_ROOT = path.resolve(__dirname, "..", "..");

// Files outside the http dir that also reference icon kinds.
const EXTRA_FILES = [path.join(BOT_ROOT, "preview.js")];

// The library itself defines kinds; it does not reference them.
const IGNORED_BASENAMES = new Set(["iconLibrary.js", "iconLibrary.test.js"]);

// Kinds that `renderIconImage` intercepts before delegating to the library, so
// they intentionally do not resolve via the shared library. Keep this list in
// sync with the special cases in adminRenderHelpers.js / preview.js.
const SPECIAL_CASED_KINDS = new Set(["logo"]);

function collectJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") {
        continue;
      }
      out.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      if (!IGNORED_BASENAMES.has(entry.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

function extractKindsFromSource(source) {
  const kinds = new Set();

  // Pattern A: renderIconImage("kind", ...) / renderIcon("kind", ...) — literal
  // first argument.
  const callRe = /renderIcon(?:Image)?\(\s*["']([A-Za-z_]\w*)["']/g;
  let match;
  while ((match = callRe.exec(source)) !== null) {
    kinds.add(match[1]);
  }

  // Pattern B: an `icon:` metadata property (nav / status / tool / feature
  // descriptors). `\b` keeps `lexicon:` and similar from matching. The value may
  // be a literal ("heartbeat") or a ternary of literals, so capture up to the
  // property's trailing comma / line end and pull every quoted literal out.
  const propRe = /\bicon:\s*([^,\n]+)/g;
  const literalRe = /["']([A-Za-z_]\w*)["']/g;
  while ((match = propRe.exec(source)) !== null) {
    let inner;
    while ((inner = literalRe.exec(match[1])) !== null) {
      kinds.add(inner[1]);
    }
    literalRe.lastIndex = 0;
  }

  return kinds;
}

const files = [...collectJsFiles(HTTP_DIR), ...EXTRA_FILES];

const referencedKinds = new Map(); // kind -> [files]
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const kind of extractKindsFromSource(source)) {
    if (!referencedKinds.has(kind)) {
      referencedKinds.set(kind, []);
    }
    referencedKinds.get(kind).push(path.relative(BOT_ROOT, file));
  }
}

test("admin render sources reference at least one icon kind", () => {
  assert.ok(
    referencedKinds.size > 0,
    "found no icon kinds to check — the scanner regexes are likely broken",
  );
});

test("every referenced icon kind resolves in the shared library", () => {
  const missing = [];
  for (const [kind, sources] of referencedKinds) {
    if (SPECIAL_CASED_KINDS.has(kind)) {
      continue;
    }
    if (!hasIcon(kind)) {
      missing.push(`  "${kind}" referenced in ${[...new Set(sources)].join(", ")}`);
    }
  }

  assert.strictEqual(
    missing.length,
    0,
    `Unknown icon kind(s) — add them to ICON_PATHS or ICON_ALIASES in iconLibrary.js:\n${missing.join("\n")}`,
  );
});

test("special-cased icon kinds stay honest", () => {
  for (const kind of SPECIAL_CASED_KINDS) {
    // It must actually be referenced; otherwise the allowlist entry is stale.
    assert.ok(
      referencedKinds.has(kind),
      `"${kind}" is allow-listed as special-cased but is no longer referenced — remove it from SPECIAL_CASED_KINDS.`,
    );
    // It must NOT resolve via the library; if it does, it is a normal icon and
    // the allowlist would mask a future regression.
    assert.ok(
      !hasIcon(kind),
      `"${kind}" now resolves in the library — remove it from SPECIAL_CASED_KINDS so it is checked normally.`,
    );
  }
});
