/**
 * Tiny subset-of-JQL evaluator for custom smart-filter facet values.
 *
 * Goal: let a user define a Smart Filter value as a JQL-ish expression like
 *   `labels in (windows, win10)`
 *   `priority = High AND status != Done`
 * and apply it to already-fetched issues client-side. We intentionally only
 * support the constructs that map onto NormalizedIssue fields, so this is
 * NOT a general JQL implementation.
 *
 * Grammar (case-insensitive keywords; case-sensitive values):
 *   expr   := clause (AND clause)*
 *   clause := FIELD OP value            (= != for text/date)
 *           | DATEFIELD RELOP date      (> >= < <= )
 *           | FIELD IN list
 *           | FIELD NOT IN list
 *           | FIELD IS EMPTY
 *           | FIELD IS NOT EMPTY
 *   value  := STRING | BAREWORD
 *   date   := relative (e.g. -4w, -7d, -2h, -30m) | absolute (2026-01-01)
 *   list   := '(' value (',' value)* ')'
 *
 * Supported text fields and how they read off a NormalizedIssue:
 *   status      → effectiveStatus.label
 *   assignee    → assignee?.name
 *   reporter    → reporter?.name
 *   priority    → priority
 *   issuetype   → issueType
 *   labels      → labels (array; equality and IN check membership)
 *   resolution  → "Done" if statusCategoryKey === "done", otherwise "Unresolved"
 *
 * Supported date fields (compared with > >= < <=, or is [not] empty):
 *   created, updated, resolved (alias: resolutiondate)
 * Relative dates resolve against "now": `created > -4w` means created within
 * the last 4 weeks. Units: w(eeks) d(ays) h(ours) m(inutes).
 *
 * Custom fields are referenced by id: `cf[10016]` or `customfield_10016`.
 *   - text/select: = != in "not in" "is [not] empty" (matches the field's
 *     value/displayName/name, and any element of a multi-value field)
 *   - numeric: > >= < <= against a number literal (e.g. cf[10016] > 5)
 *   - date custom fields: > >= < <= against a relative/absolute date
 * Custom-field values are only available when the search fetched them
 * (the resolution dashboard requests all fields).
 *
 * Errors throw a JqlParseError with the cursor position so the settings UI
 * can highlight where parsing broke.
 */
import type { NormalizedIssue } from "@/lib/jira/types";

export class JqlParseError extends Error {
  constructor(
    message: string,
    public readonly position: number,
  ) {
    super(message);
  }
}

type RelOp = ">" | ">=" | "<" | "<=";

// `field` is a raw field name: a builtin (status, created, …) or a custom
// field id ("customfield_10016", normalized from cf[10016]).
type Comparison =
  | { kind: "eq"; field: string; value: string }
  | { kind: "neq"; field: string; value: string }
  | { kind: "in"; field: string; values: string[] }
  | { kind: "notIn"; field: string; values: string[] }
  | { kind: "isEmpty"; field: string }
  | { kind: "isNotEmpty"; field: string }
  | { kind: "relCompare"; field: string; op: RelOp; raw: string };

type Ast = { kind: "and"; clauses: Comparison[] };

const CUSTOM_FIELD_RE = /^customfield_\d+$/;
function isCustomField(field: string): boolean {
  return CUSTOM_FIELD_RE.test(field);
}

const TEXT_FIELDS = [
  "status",
  "assignee",
  "reporter",
  "priority",
  "issuetype",
  "labels",
  "resolution",
] as const;
const DATE_FIELDS = ["created", "updated", "resolved", "resolutiondate"] as const;
const FIELDS = [...TEXT_FIELDS, ...DATE_FIELDS] as const;
type Field = (typeof FIELDS)[number];
const FIELD_SET = new Set<string>(FIELDS);
const DATE_FIELD_SET = new Set<string>(DATE_FIELDS);

function isDateField(field: string): boolean {
  return DATE_FIELD_SET.has(field);
}

type Token =
  | { type: "ident"; value: string; position: number }
  | { type: "string"; value: string; position: number }
  | {
      type: "punct";
      value: "(" | ")" | "," | "=" | "!=" | ">" | ">=" | "<" | "<=";
      position: number;
    }
  | { type: "eof"; position: number };

/* -------------------------------------------------------------------------- */
/*  Tokenizer                                                                  */
/* -------------------------------------------------------------------------- */

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === ",") {
      tokens.push({ type: "punct", value: ch, position: i });
      i++;
      continue;
    }
    if (ch === "!") {
      if (input[i + 1] === "=") {
        tokens.push({ type: "punct", value: "!=", position: i });
        i += 2;
        continue;
      }
      throw new JqlParseError("Expected '=' after '!'", i);
    }
    if (ch === "=") {
      tokens.push({ type: "punct", value: "=", position: i });
      i++;
      continue;
    }
    if (ch === ">") {
      if (input[i + 1] === "=") {
        tokens.push({ type: "punct", value: ">=", position: i });
        i += 2;
      } else {
        tokens.push({ type: "punct", value: ">", position: i });
        i++;
      }
      continue;
    }
    if (ch === "<") {
      if (input[i + 1] === "=") {
        tokens.push({ type: "punct", value: "<=", position: i });
        i += 2;
      } else {
        tokens.push({ type: "punct", value: "<", position: i });
        i++;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      let value = "";
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < input.length) {
          value += input[i + 1];
          i += 2;
        } else {
          value += input[i];
          i++;
        }
      }
      if (i >= input.length) {
        throw new JqlParseError("Unterminated string literal", start);
      }
      i++; // closing quote
      tokens.push({ type: "string", value, position: start });
      continue;
    }
    // Custom field shorthand `cf[NNNNN]` → normalize to `customfield_NNNNN`.
    const cfMatch = /^cf\[(\d+)\]/i.exec(input.slice(i));
    if (cfMatch) {
      tokens.push({
        type: "ident",
        value: `customfield_${cfMatch[1]}`,
        position: i,
      });
      i += cfMatch[0].length;
      continue;
    }
    // Bare identifier / value — letters, digits, _, -, +, ., :
    // (+/- and : let relative dates like `-4w` and ISO timestamps tokenize
    // as a single value.)
    if (/[A-Za-z0-9_+\-.:]/.test(ch)) {
      const start = i;
      while (i < input.length && /[A-Za-z0-9_+\-.:]/.test(input[i])) {
        i++;
      }
      tokens.push({
        type: "ident",
        value: input.slice(start, i),
        position: start,
      });
      continue;
    }
    throw new JqlParseError(`Unexpected character '${ch}'`, i);
  }
  tokens.push({ type: "eof", position: input.length });
  return tokens;
}

/* -------------------------------------------------------------------------- */
/*  Parser                                                                     */
/* -------------------------------------------------------------------------- */

class Parser {
  private cursor = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.cursor];
  }
  private advance(): Token {
    return this.tokens[this.cursor++];
  }
  private isKeyword(t: Token, kw: string): boolean {
    return t.type === "ident" && t.value.toLowerCase() === kw.toLowerCase();
  }

  parse(): Ast {
    const clauses: Comparison[] = [];
    clauses.push(this.parseClause());
    while (this.isKeyword(this.peek(), "AND")) {
      this.advance();
      clauses.push(this.parseClause());
    }
    const tail = this.peek();
    if (tail.type !== "eof") {
      throw new JqlParseError(
        `Unexpected token '${tokenText(tail)}'`,
        tail.position,
      );
    }
    return { kind: "and", clauses };
  }

  private parseClause(): Comparison {
    const fieldTok = this.advance();
    if (fieldTok.type !== "ident") {
      throw new JqlParseError("Expected field name", fieldTok.position);
    }
    const lower = fieldTok.value.toLowerCase();
    const custom = isCustomField(lower);
    if (!FIELD_SET.has(lower) && !custom) {
      throw new JqlParseError(
        `Unknown field '${fieldTok.value}'. Supported: ${FIELDS.join(", ")}, or cf[NNNNN]`,
        fieldTok.position,
      );
    }
    const field = lower;
    const dateField = isDateField(field); // builtin date field
    const op = this.advance();

    // Relational operators apply to builtin date fields and custom fields
    // (numeric / date custom fields).
    if (
      op.type === "punct" &&
      (op.value === ">" || op.value === ">=" || op.value === "<" || op.value === "<=")
    ) {
      if (!dateField && !custom) {
        throw new JqlParseError(
          `'${op.value}' only applies to date fields (created, updated, resolved) or custom fields (cf[…])`,
          op.position,
        );
      }
      return { kind: "relCompare", field, op: op.value, raw: this.parseValue() };
    }

    if (op.type === "punct" && op.value === "=") {
      if (dateField) {
        throw new JqlParseError(
          "Date fields use > >= < <= or 'is [not] empty'",
          op.position,
        );
      }
      return { kind: "eq", field, value: this.parseValue() };
    }
    if (op.type === "punct" && op.value === "!=") {
      if (dateField) {
        throw new JqlParseError(
          "Date fields use > >= < <= or 'is [not] empty'",
          op.position,
        );
      }
      return { kind: "neq", field, value: this.parseValue() };
    }
    if (op.type === "ident") {
      const lo = op.value.toLowerCase();
      if (lo === "in") {
        if (dateField) {
          throw new JqlParseError("IN is not supported for date fields", op.position);
        }
        return { kind: "in", field, values: this.parseList() };
      }
      if (lo === "not") {
        const next = this.advance();
        if (next.type === "ident" && next.value.toLowerCase() === "in") {
          if (dateField) {
            throw new JqlParseError(
              "NOT IN is not supported for date fields",
              next.position,
            );
          }
          return { kind: "notIn", field, values: this.parseList() };
        }
        throw new JqlParseError("Expected 'in' after 'not'", next.position);
      }
      if (lo === "is") {
        const next = this.advance();
        if (next.type === "ident" && next.value.toLowerCase() === "empty") {
          return { kind: "isEmpty", field };
        }
        if (next.type === "ident" && next.value.toLowerCase() === "not") {
          const after = this.advance();
          if (
            after.type === "ident" &&
            after.value.toLowerCase() === "empty"
          ) {
            return { kind: "isNotEmpty", field };
          }
          throw new JqlParseError(
            "Expected 'empty' after 'is not'",
            after.position,
          );
        }
        throw new JqlParseError(
          "Expected 'empty' or 'not empty' after 'is'",
          next.position,
        );
      }
    }
    throw new JqlParseError(
      `Expected '=', '!=', '>', '>=', '<', '<=', 'in', 'not in', or 'is [not] empty' but got '${tokenText(op)}'`,
      op.position,
    );
  }

  private parseValue(): string {
    const t = this.advance();
    if (t.type === "string" || t.type === "ident") return t.value;
    throw new JqlParseError("Expected value", t.position);
  }

  private parseList(): string[] {
    const open = this.advance();
    if (open.type !== "punct" || open.value !== "(") {
      throw new JqlParseError("Expected '('", open.position);
    }
    const values: string[] = [];
    values.push(this.parseValue());
    while (true) {
      const next = this.peek();
      if (next.type === "punct" && next.value === ",") {
        this.advance();
        values.push(this.parseValue());
        continue;
      }
      if (next.type === "punct" && next.value === ")") {
        this.advance();
        return values;
      }
      throw new JqlParseError("Expected ',' or ')'", next.position);
    }
  }
}

function tokenText(t: Token): string {
  if (t.type === "eof") return "<end of input>";
  return String(t.value);
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

export type CompiledJql = (issue: NormalizedIssue) => boolean;

export function parseJql(input: string): Ast {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new JqlParseError("Empty expression", 0);
  }
  const tokens = tokenize(trimmed);
  return new Parser(tokens).parse();
}

/**
 * Compile to a predicate. `now` anchors relative dates (e.g. `created > -4w`)
 * and defaults to the current time; callers may pass a fixed value for
 * deterministic behaviour/tests. It's captured at compile time, which is fine
 * because callers recompile on each render.
 */
export function compileJql(input: string, now: number = Date.now()): CompiledJql {
  const ast = parseJql(input);
  return (issue) => evaluate(ast, issue, now);
}

/**
 * Best-effort parse + return null on failure. Used by call sites that want to
 * silently skip invalid stored expressions (e.g., dashboard render) rather
 * than crash the page.
 */
export function tryCompileJql(
  input: string,
  now: number = Date.now(),
): CompiledJql | null {
  try {
    return compileJql(input, now);
  } catch {
    return null;
  }
}

const CUSTOM_FIELD_REF_RE = /cf\[(\d+)\]|customfield_(\d+)/gi;

/**
 * Scan a restricted-JQL string for the custom fields it references, in either
 * `cf[NNNNN]` or `customfield_NNNNN` form, and return them normalized to
 * `customfield_NNNNN` (deduped).
 *
 * Lets the resolution-time fetcher request only the custom fields actually
 * referenced by ratio analysis / custom facets instead of pulling every field
 * with `*all`. A purely textual scan (not a full parse) so a malformed
 * expression still surfaces the field ids it mentions.
 */
export function extractCustomFieldIds(input: string): string[] {
  const ids = new Set<string>();
  for (const m of input.matchAll(CUSTOM_FIELD_REF_RE)) {
    const num = m[1] ?? m[2];
    if (num) ids.add(`customfield_${num}`);
  }
  return [...ids];
}

/* -------------------------------------------------------------------------- */
/*  Evaluator                                                                  */
/* -------------------------------------------------------------------------- */

function evaluate(ast: Ast, issue: NormalizedIssue, now: number): boolean {
  for (const c of ast.clauses) {
    if (!evalClause(c, issue, now)) return false;
  }
  return true;
}

function evalClause(c: Comparison, issue: NormalizedIssue, now: number): boolean {
  if (c.kind === "relCompare") {
    return evalRelCompare(c, issue, now);
  }
  if (isCustomField(c.field)) {
    return evalCustomEquality(c, issue);
  }
  if (c.field === "labels") {
    return evalLabels(c, issue.labels);
  }
  const actual = readField(c.field as Exclude<Field, "labels">, issue);
  switch (c.kind) {
    case "eq":
      return actual === c.value;
    case "neq":
      return actual !== c.value;
    case "in":
      return actual !== undefined && c.values.includes(actual);
    case "notIn":
      return actual === undefined || !c.values.includes(actual);
    case "isEmpty":
      return actual === undefined || actual === "";
    case "isNotEmpty":
      return actual !== undefined && actual !== "";
  }
}

/* ----------------------------- custom fields ----------------------------- */

/** Flatten a custom-field value into comparable strings (selects, arrays…). */
function customToStrings(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.flatMap(customToStrings);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.value === "string" || typeof o.value === "number") {
      return [String(o.value)];
    }
    if (typeof o.displayName === "string") return [o.displayName];
    if (typeof o.name === "string") return [o.name];
    return [];
  }
  return [String(v)];
}

function customToNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.value === "number") return o.value;
    if (typeof o.value === "string") {
      const n = Number(o.value);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

function customToDateString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.value === "string") return o.value;
  }
  return null;
}

function evalCustomEquality(
  c: Exclude<Comparison, { kind: "relCompare" }>,
  issue: NormalizedIssue,
): boolean {
  const strs = customToStrings(issue.customFields?.[c.field]);
  switch (c.kind) {
    case "eq":
      return strs.includes(c.value);
    case "neq":
      return !strs.includes(c.value);
    case "in":
      return strs.some((s) => c.values.includes(s));
    case "notIn":
      return strs.every((s) => !c.values.includes(s));
    case "isEmpty":
      return strs.length === 0;
    case "isNotEmpty":
      return strs.length > 0;
  }
}

function cmpNum(a: number, b: number, op: RelOp): boolean {
  switch (op) {
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    default:
      return false;
  }
}

/** Resolve a relative (`-4w`) or absolute (`2026-01-01`) date to epoch ms. */
function resolveDateExpr(raw: string, now: number): number | null {
  const rel = raw.match(/^([+-]?\d+)([wdhm])$/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2];
    const ms =
      unit === "w"
        ? 7 * 86400000
        : unit === "d"
          ? 86400000
          : unit === "h"
            ? 3600000
            : 60000;
    return now + n * ms; // `-4w` → now − 4 weeks
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function evalRelCompare(
  c: Extract<Comparison, { kind: "relCompare" }>,
  issue: NormalizedIssue,
  now: number,
): boolean {
  // Custom fields: numeric comparison when the literal is a plain number and
  // the value is numeric; otherwise fall back to a date comparison.
  if (isCustomField(c.field)) {
    const v = issue.customFields?.[c.field];
    if (/^-?\d+(\.\d+)?$/.test(c.raw)) {
      const num = customToNumber(v);
      if (num !== null) return cmpNum(num, Number(c.raw), c.op);
    }
    const ds = customToDateString(v);
    if (ds) {
      const a = Date.parse(ds);
      const t = resolveDateExpr(c.raw, now);
      if (Number.isFinite(a) && t !== null) return cmpNum(a, t, c.op);
    }
    return false;
  }

  // Builtin date field.
  const dateStr = readDateField(c.field, issue);
  if (!dateStr) return false; // missing date can't satisfy a comparison
  const actual = Date.parse(dateStr);
  if (!Number.isFinite(actual)) return false;
  const target = resolveDateExpr(c.raw, now);
  if (target === null) return false;
  return cmpNum(actual, target, c.op);
}

function readDateField(field: string, issue: NormalizedIssue): string | undefined {
  switch (field) {
    case "created":
      return issue.created;
    case "updated":
      return issue.updated;
    case "resolved":
    case "resolutiondate":
      return issue.resolved;
    default:
      return undefined;
  }
}

function evalLabels(c: Comparison, labels: string[]): boolean {
  switch (c.kind) {
    case "eq":
      return labels.includes(c.value);
    case "neq":
      return !labels.includes(c.value);
    case "in":
      return labels.some((l) => c.values.includes(l));
    case "notIn":
      return labels.every((l) => !c.values.includes(l));
    case "isEmpty":
      return labels.length === 0;
    case "isNotEmpty":
      return labels.length > 0;
    default:
      // labels never produces a dateCompare clause; unreachable.
      return false;
  }
}

function readField(field: Exclude<Field, "labels">, issue: NormalizedIssue): string | undefined {
  switch (field) {
    case "status":
      return issue.effectiveStatus.label;
    case "assignee":
      return issue.assignee?.name;
    case "reporter":
      return issue.reporter?.name;
    case "priority":
      return issue.priority;
    case "issuetype":
      return issue.issueType;
    case "resolution":
      // Mirror Jira's `resolution = Unresolved` semantics by exposing two
      // values: "Done" or "Unresolved".
      return issue.statusCategoryKey === "done" ? "Done" : "Unresolved";
    case "created":
      return issue.created;
    case "updated":
      return issue.updated;
    case "resolved":
    case "resolutiondate":
      // Lets `resolved is [not] empty` work as an unresolved/resolved filter.
      return issue.resolved;
  }
}
