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
 *   clause := FIELD OP value
 *           | FIELD IN list
 *           | FIELD NOT IN list
 *           | FIELD IS EMPTY
 *           | FIELD IS NOT EMPTY
 *   value  := STRING | BAREWORD
 *   list   := '(' value (',' value)* ')'
 *
 * Supported fields and how they read off a NormalizedIssue:
 *   status      → effectiveStatus.label
 *   assignee    → assignee?.name
 *   reporter    → reporter?.name
 *   priority    → priority
 *   issuetype   → issueType
 *   labels      → labels (array; equality and IN check membership)
 *   resolution  → "Done" if statusCategoryKey === "done", otherwise "Unresolved"
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

type Comparison =
  | { kind: "eq"; field: Field; value: string }
  | { kind: "neq"; field: Field; value: string }
  | { kind: "in"; field: Field; values: string[] }
  | { kind: "notIn"; field: Field; values: string[] }
  | { kind: "isEmpty"; field: Field }
  | { kind: "isNotEmpty"; field: Field };

type Ast = { kind: "and"; clauses: Comparison[] };

const FIELDS = [
  "status",
  "assignee",
  "reporter",
  "priority",
  "issuetype",
  "labels",
  "resolution",
] as const;
type Field = (typeof FIELDS)[number];
const FIELD_SET = new Set<string>(FIELDS);

type Token =
  | { type: "ident"; value: string; position: number }
  | { type: "string"; value: string; position: number }
  | { type: "punct"; value: "(" | ")" | "," | "=" | "!="; position: number }
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
    // Bare identifier / value — letters, digits, _, -, ., :
    if (/[A-Za-z0-9_\-.:]/.test(ch)) {
      const start = i;
      while (i < input.length && /[A-Za-z0-9_\-.:]/.test(input[i])) {
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
    if (!FIELD_SET.has(lower)) {
      throw new JqlParseError(
        `Unknown field '${fieldTok.value}'. Supported: ${FIELDS.join(", ")}`,
        fieldTok.position,
      );
    }
    const field = lower as Field;
    const op = this.advance();
    if (op.type === "punct" && op.value === "=") {
      return { kind: "eq", field, value: this.parseValue() };
    }
    if (op.type === "punct" && op.value === "!=") {
      return { kind: "neq", field, value: this.parseValue() };
    }
    if (op.type === "ident") {
      const lo = op.value.toLowerCase();
      if (lo === "in") {
        return { kind: "in", field, values: this.parseList() };
      }
      if (lo === "not") {
        const next = this.advance();
        if (next.type === "ident" && next.value.toLowerCase() === "in") {
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
      `Expected '=', '!=', 'in', 'not in', or 'is [not] empty' but got '${tokenText(op)}'`,
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

export function compileJql(input: string): CompiledJql {
  const ast = parseJql(input);
  return (issue) => evaluate(ast, issue);
}

/**
 * Best-effort parse + return null on failure. Used by call sites that want to
 * silently skip invalid stored expressions (e.g., dashboard render) rather
 * than crash the page.
 */
export function tryCompileJql(input: string): CompiledJql | null {
  try {
    return compileJql(input);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Evaluator                                                                  */
/* -------------------------------------------------------------------------- */

function evaluate(ast: Ast, issue: NormalizedIssue): boolean {
  for (const c of ast.clauses) {
    if (!evalClause(c, issue)) return false;
  }
  return true;
}

function evalClause(c: Comparison, issue: NormalizedIssue): boolean {
  if (c.field === "labels") {
    return evalLabels(c, issue.labels);
  }
  const actual = readField(c.field, issue);
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
  }
}
