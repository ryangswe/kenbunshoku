// SPDX-License-Identifier: Apache-2.0
// docs/hover-map.md names the code it maps, and the names are real.
//
// The map ties each element to code by anchors, written `src/<folder>/<file>.ts#<symbol>`. This
// test checks names only: the file exists, the file defines the symbol (a function, class,
// interface, type, constant, method or function-valued field, not just a mention), every spec
// clause the map cites is in the vendored clause list (vendor/cardvision-browser/hover-spec.json),
// and every file in the map's coverage list carries at least one anchor. It does not check
// behavior; the diagrams are read by a reviewer. It is the toolkit's tests/test_hover_map.py,
// ported. Nothing here reads the network.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const MAP = join(ROOT, "docs", "hover-map.md");
const SPEC = join(ROOT, "vendor", "cardvision-browser", "hover-spec.json");
const VENDOR = join(ROOT, "vendor", "cardvision-browser", "cardvision-vendor.json");
/** The map's link to the toolkit's hover spec, at a commit. */
const SPEC_LINK = /\]\(https:\/\/github\.com\/ryangswe\/riftsight-vision\/blob\/([0-9a-f]{7,40})\/docs\/hover-spec\.md(?:#[^)\s]*)?\)/g;

const FIX = "update docs/hover-map.md in the same change (names it anchors, the clause ids it cites, its coverage list)";

/** `src/x.ts` or `src/x.ts#Class.member`, in backticks. */
const ANCHOR = /`(src\/[A-Za-z0-9_./-]+\.ts)(?:#([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?))?`/g;
const CLAUSE = /\bS-[A-Z]\d+\b/g;
const MODIFIERS = String.raw`(?:(?:private|public|protected|static|async|readonly|override)\s+)*`;

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The map's body, and its `## Coverage` section. */
export function splitCoverage(text: string): [string, string] {
  const at = text.indexOf("\n## Coverage\n");
  return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + "\n## Coverage\n".length)];
}

/** The source without comments and the text of quoted strings, so braces in them are not counted. */
export function stripCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\'"`])\/\/[^\n]*/gm, "$1")
    .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g, '""');
}

/** The lines of `cls` that start at the depth of its members (not inside a method's body). */
function classMembers(source: string, cls: string): string[] {
  const lines = stripCode(source).split("\n");
  const head = new RegExp(String.raw`\bclass\s+${escape(cls)}\b`);
  const start = lines.findIndex((line) => head.test(line));
  if (start < 0) return [];
  const members: string[] = [];
  let depth = 0;
  let opened = false;
  for (const line of lines.slice(start)) {
    if (opened && depth === 1) members.push(line);
    depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
    opened ||= depth > 0;
    if (opened && depth <= 0) break;
  }
  return members;
}

/** A method's first line: `name(...) {`, with its modifiers, a getter or setter, type parameters
 *  and a return type. */
function methodLine(name: string): RegExp {
  return new RegExp(
    String.raw`^[ \t]+${MODIFIERS}(?:(?:get|set)\s+)?${escape(name)}\s*(?:<[^>\n]*>)?\([^\n]*\)\s*(?::[^\n]*)?\{\s*(?:\}\s*)?$`,
    "m",
  );
}

/** A function-valued field's first line: `name = (...) => ...`, as a class writes its listeners. */
function arrowFieldLine(name: string): RegExp {
  return new RegExp(String.raw`^[ \t]+${MODIFIERS}${escape(name)}\s*(?::[^=\n]*)?=\s*(?:async\s*)?\([^\n]*\)\s*(?::[^\n]*)?=>`, "m");
}

/** Whether `source` defines `symbol` rather than mentions it. `name`: a function, class,
 *  interface, type, enum or constant, or a method. `Class.name`: a method or a function-valued
 *  field written in the body of that class, and nothing else (a local of the same name does not
 *  count). */
export function defined(source: string, symbol: string): boolean {
  const dot = symbol.lastIndexOf(".");
  if (dot >= 0) {
    const name = symbol.slice(dot + 1);
    const method = methodLine(name);
    const field = arrowFieldLine(name);
    return classMembers(source, symbol.slice(0, dot)).some((line) => method.test(line) || field.test(line));
  }
  const stripped = stripCode(source);
  const declared = new RegExp(String.raw`\b(?:function\*?|class|interface|type|enum|const|let|var)\s+${escape(symbol)}\b`);
  return declared.test(stripped) || methodLine(symbol).test(stripped);
}

/** The clause ids in the vendored clause list. */
export function specClauses(specText: string): Set<string> {
  const doc = JSON.parse(specText) as { clauses?: Array<{ id?: unknown }> };
  return new Set((doc.clauses ?? []).map((c) => c.id).filter((id): id is string => typeof id === "string"));
}

const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile();

/** Files the coverage list names more than once, or a note that the list is empty. */
export function coverageRepeats(text: string): string[] {
  const [, coverage] = splitCoverage(text);
  const paths = [...coverage.matchAll(ANCHOR)].map((m) => m[1]!);
  if (paths.length === 0) return ["the coverage list is empty"];
  return [...new Set(paths.filter((path, i) => paths.indexOf(path) !== i))].map((path) => `coverage ${path}: listed more than once`);
}

/** Problems with the map's links to the hover spec: none, or one not at the vendored commit. */
export function specLinkProblems(text: string, vendorText: string): string[] {
  const vendored = (JSON.parse(vendorText) as { toolkit?: { commit?: unknown } }).toolkit?.commit;
  const linked = [...text.matchAll(SPEC_LINK)].map((m) => m[1]!);
  if (linked.length === 0) return ["the map has no hover spec link"];
  return linked.filter((commit) => commit !== vendored).map((commit) => `the hover spec link is at ${commit}, not the vendored commit ${String(vendored)}`);
}

export function problemsOf(text: string, root: string, specText: string): string[] {
  const [body, coverage] = splitCoverage(text);
  const found: string[] = [];
  const clauses = specClauses(specText);
  const anchored = new Set<string>();
  const anchors = [...body.matchAll(ANCHOR)];
  if (anchors.length === 0) found.push("the map has no anchors");
  for (const [, path, symbol] of anchors) {
    const file = join(root, path!);
    if (!isFile(file)) {
      found.push(`anchor ${path}#${symbol ?? ""}: the file does not exist`);
      continue;
    }
    anchored.add(path!);
    if (symbol && !defined(readFileSync(file, "utf-8"), symbol)) found.push(`anchor ${path}#${symbol}: ${path} defines no ${symbol}`);
  }
  for (const clause of [...new Set(body.match(CLAUSE) ?? [])].sort()) {
    if (!clauses.has(clause)) found.push(`clause ${clause} is not in vendor/cardvision-browser/hover-spec.json`);
  }
  const covered = [...coverage.matchAll(ANCHOR)];
  if (covered.length === 0) found.push("the map has no coverage list");
  for (const [, path] of covered) {
    if (!isFile(join(root, path!))) found.push(`coverage ${path}: the file does not exist`);
    else if (!anchored.has(path!)) found.push(`coverage ${path}: no anchor in the map names this file`);
  }
  if ((body.match(/^```mermaid$/gm)?.length ?? 0) < 3 || !body.includes("sequenceDiagram")) {
    found.push("the map needs its Mermaid diagrams (at least three, one a sequenceDiagram)");
  }
  return found;
}

describe("the hover map", () => {
  it("matches the code", () => {
    const found = problemsOf(readFileSync(MAP, "utf-8"), ROOT, readFileSync(SPEC, "utf-8"));
    expect(found, `docs/hover-map.md is out of date with the code: ${FIX}\n  ${found.join("\n  ")}`).toEqual([]);
  });

  // The toolkit's downstream canary vendors a toolkit pull request's own build here, so the vendored
  // commit can never be the one the map links. It sets CARDVISION_CANARY=1, and this one check is
  // skipped there. Every other run of the tests keeps it.
  it.skipIf(process.env.CARDVISION_CANARY === "1")("links the hover spec at the vendored toolkit commit", () => {
    const found = specLinkProblems(readFileSync(MAP, "utf-8"), readFileSync(VENDOR, "utf-8"));
    expect(found, `${FIX}\n  ${found.join("\n  ")}`).toEqual([]);
  });

  it("lists each covered file once", () => {
    const found = coverageRepeats(readFileSync(MAP, "utf-8"));
    expect(found, `${FIX}\n  ${found.join("\n  ")}`).toEqual([]);
  });
});

// The checker itself, on small trees: it must fail on each kind of drift.

const SOURCE = `export const LIMIT = 3;
export interface Thing { a: number }
export function top(x: number): number {
  const inner = (): void => {};
  return x;
}
export class Box {
  private hidden(): boolean {
    return true;
  }
  show(a: number, b?: string): void {
    const inner = 1;
    this.hidden();
  }
  private readonly onMove = (event: Event): void => {
    const nested = (): void => {};
  };
}
export class Other {
  other(): void {
    const inner = (): void => {};
  }
}
// mentioned() only in a comment
`;
const GOOD = `# Map

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`
\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`
\`\`\`mermaid
sequenceDiagram
  A->>B: m
\`\`\`

| E | Anchors | Spec |
| --- | --- | --- |
| a | \`src/x.ts#top\`, \`src/x.ts#Box.show\`, \`src/x.ts#Box.onMove\`, \`src/x.ts#LIMIT\` | S-A1 |

## Coverage

- \`src/x.ts\`
`;
const SPEC_TEXT = JSON.stringify({ clauses: [{ id: "S-A1", title: "One" }] });

describe("the map checker", () => {
  let tree: string;
  beforeEach(() => {
    tree = mkdtempSync(join(tmpdir(), "hover-map-"));
    mkdirSync(join(tree, "src"));
    writeFileSync(join(tree, "src", "x.ts"), SOURCE);
    writeFileSync(join(tree, "src", "y.ts"), "export const Y = 1;\n");
  });
  afterEach(() => rmSync(tree, { recursive: true, force: true }));

  it("passes a sound map", () => {
    expect(problemsOf(GOOD, tree, SPEC_TEXT)).toEqual([]);
  });

  it.each([
    ["#top`", "#bottom`", "defines no bottom"],
    ["#Box.show`", "#Box.hide`", "defines no Box.hide"],
    ["#Box.show`", "#Crate.show`", "defines no Crate.show"],
    ["#Box.show`", "#Other.show`", "defines no Other.show"],
    ["#Box.show`", "#Box.inner`", "defines no Box.inner"],
    ["#Box.onMove`", "#Box.nested`", "defines no Box.nested"],
    ["#Box.onMove`", "#Other.onMove`", "defines no Other.onMove"],
    ["#LIMIT`", "#mentioned`", "defines no mentioned"],
    ["src/x.ts#top", "src/gone.ts#top", "the file does not exist"],
    ["| S-A1 |", "| S-A9 |", "clause S-A9 is not in"],
    ["- `src/x.ts`", "- `src/x.ts`\n- `src/y.ts`", "coverage src/y.ts: no anchor"],
    ["- `src/x.ts`", "- `src/gone.ts`", "coverage src/gone.ts: the file does not exist"],
    ["sequenceDiagram", "gantt", "needs its Mermaid diagrams"],
  ])("finds the drift when %s becomes %s", (before, after, expected) => {
    expect(GOOD.includes(before)).toBe(true);
    const found = problemsOf(GOOD.replace(before, after), tree, SPEC_TEXT);
    expect(found.some((line) => line.includes(expected)), found.join("\n")).toBe(true);
  });

  it("finds a map with no coverage list", () => {
    const noCoverage = GOOD.split("## Coverage")[0]!;
    expect(problemsOf(noCoverage, tree, SPEC_TEXT).some((line) => line.includes("the map has no coverage list"))).toBe(true);
  });

  it("finds a coverage list that names a file twice, or none", () => {
    expect(coverageRepeats(GOOD)).toEqual([]);
    expect(coverageRepeats(`${GOOD}- \`src/x.ts\`\n`)).toEqual(["coverage src/x.ts: listed more than once"]);
    expect(coverageRepeats(GOOD.split("## Coverage")[0]!)).toEqual(["the coverage list is empty"]);
  });

  it("finds a hover spec link that is missing or at another commit", () => {
    const vendor = JSON.stringify({ toolkit: { commit: "a".repeat(40) } });
    const link = (commit: string, anchor = ""): string => `[spec](https://github.com/ryangswe/riftsight-vision/blob/${commit}/docs/hover-spec.md${anchor})`;
    expect(specLinkProblems(link("a".repeat(40)), vendor)).toEqual([]);
    expect(specLinkProblems("no link here", vendor)).toEqual(["the map has no hover spec link"]);
    expect(specLinkProblems(link("b".repeat(40)), vendor)[0]).toContain("not the vendored commit");
    expect(specLinkProblems(link("b".repeat(40), "#s-g3"), vendor)[0]).toContain("not the vendored commit");
  });

  it("does not count the coverage list as an anchor", () => {
    const onlyListed = `${GOOD.split("| E |")[0]}\n## Coverage\n\n- \`src/x.ts\`\n`;
    expect(problemsOf(onlyListed, tree, SPEC_TEXT).some((line) => line.includes("the map has no anchors"))).toBe(true);
  });

  it("takes a dotted anchor only for a member of that class, not a local or a function", () => {
    const source =
      "export class A {\n  run(): void {\n    const show = (): void => {};\n  }\n}\nexport function show(): void {}\nexport class B {\n  show(): void {}\n}\n";
    // A local and a function of that name are not a member of A.
    expect(defined(source, "A.show")).toBe(false);
    expect(defined(source, "B.show")).toBe(true);
    expect(defined(source, "A.missing")).toBe(false);
    expect(defined("export class A {}\nconst show = 1;\n", "A.show")).toBe(false);
  });

  it("does not take a comment or a string for a symbol", () => {
    const source = '// export function gone(): void {}\n/* const gone = 1; */\nconst text = "function gone() {}";\n';
    expect(defined(source, "gone")).toBe(false);
    expect(defined("export function gone(): void {}\n", "gone")).toBe(true);
  });
});
