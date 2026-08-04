# Workflow Automation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hand-written workflow graph engine (typed DAG model, validation, a recursive-descent expression parser/evaluator, and an async concurrent execution engine with a replayable trace) inside `web/`, wrapped in a React Flow canvas at a standalone `/automation` route, with three pre-built member-club demo workflows.

**Architecture:** Engine core (`web/lib/workflow/**`) is plain TypeScript with zero React/DOM imports, fully unit-tested with Vitest. Two Zustand stores (`web/stores/**`) bridge the engine to React. UI (`web/app/automation/**`) is React Flow + custom node components styled with the existing Verve design tokens. See `docs/superpowers/specs/2026-08-04-workflow-automation-engine-design.md` for the full rationale.

**Tech Stack:** React 19 + TypeScript strict (existing `web/`), `@xyflow/react`, `zustand`, Vitest, `localStorage`.

---

## File Structure

```
web/
  vitest.config.ts                                    [new]
  lib/workflow/
    types.ts                                          [new] graph model
    validation.ts                                      [new] cycle/reachability/arity checks
    validation.test.ts                                 [new]
    persistence.ts                                     [new] localStorage save/load
    persistence.test.ts                                [new]
    rf-adapter.ts                                       [new] WorkflowGraph <-> React Flow shape
    expression/
      tokens.ts                                        [new] Token/TokenType
      tokenizer.ts                                      [new]
      tokenizer.test.ts                                 [new]
      ast.ts                                            [new] Expr union
      parser.ts                                         [new]
      parser.test.ts                                    [new]
      context.ts                                        [new] EvalContext type
      evaluator.ts                                      [new]
      evaluator.test.ts                                  [new]
    execution/
      trace.ts                                          [new] ExecutionStep/RunStatus
      executor.ts                                        [new] runWorkflow async generator
      executor.test.ts                                   [new]
    examples/
      onboarding.ts                                      [new]
      overdue-dues.ts                                    [new]
      no-show-followup.ts                                [new]
      index.ts                                           [new]
  stores/
    useWorkflowStore.ts                                 [new]
    useExecutionStore.ts                                [new]
  app/automation/
    page.tsx                                            [new] route entry
    automation.css                                       [new]
    components/
      Canvas.tsx                                         [new]
      Toolbar.tsx                                        [new]
      Inspector.tsx                                       [new]
      ExecutionPanel.tsx                                  [new]
      nodes/
        BaseNode.tsx                                      [new] shared card shell
        TriggerNode.tsx                                    [new]
        ActionNode.tsx                                     [new]
        ConditionNode.tsx                                   [new]
        DelayNode.tsx                                       [new]
        BranchNode.tsx                                       [new]
        MergeNode.tsx                                         [new]
        index.ts                                              [new] nodeTypes map
  package.json                                          [modify] add deps + test script
```

---

## Task 1: Project setup — dependencies, Vitest config

**Files:**
- Modify: `web/package.json`
- Create: `web/vitest.config.ts`

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd web
npm install zustand @xyflow/react
npm install -D vitest
```

- [ ] **Step 2: Add test scripts to `web/package.json`**

Add to the `"scripts"` block:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Verify Vitest runs with zero tests**

Run: `cd web && npm test`
Expected: `No test files found` (or 0 tests) with exit code reflecting no failures — confirms config loads.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/vitest.config.ts
git commit -m "chore: add zustand, @xyflow/react, vitest to web/"
```

---

## Task 2: Graph data model

**Files:**
- Create: `web/lib/workflow/types.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
export type NodeType = 'trigger' | 'action' | 'condition' | 'delay' | 'branch' | 'merge';

export interface Point {
  x: number;
  y: number;
}

export interface TriggerData {
  label: string;
  description: string;
}

export interface ActionData {
  label: string;
  description: string;
}

export interface ConditionData {
  label: string;
  expression: string;
}

export interface DelayData {
  label: string;
  simulatedDuration: string;
  demoMs: number;
}

export interface BranchData {
  label: string;
}

export interface MergeData {
  label: string;
}

export type WorkflowNode =
  | { id: string; type: 'trigger'; position: Point; data: TriggerData }
  | { id: string; type: 'action'; position: Point; data: ActionData }
  | { id: string; type: 'condition'; position: Point; data: ConditionData }
  | { id: string; type: 'delay'; position: Point; data: DelayData }
  | { id: string; type: 'branch'; position: Point; data: BranchData }
  | { id: string; type: 'merge'; position: Point; data: MergeData };

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: 'true' | 'false' | null;
}

export interface WorkflowGraph {
  schemaVersion: 1;
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
```

There's no test for this file — it's types only, exercised by every other test in this plan.

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: no errors referencing `types.ts`.

- [ ] **Step 3: Commit**

```bash
git add web/lib/workflow/types.ts
git commit -m "feat: add workflow graph type model"
```

---

## Task 3: Expression tokenizer

**Files:**
- Create: `web/lib/workflow/expression/tokens.ts`
- Create: `web/lib/workflow/expression/tokenizer.ts`
- Test: `web/lib/workflow/expression/tokenizer.test.ts`

- [ ] **Step 1: Write `tokens.ts`**

```ts
export type TokenType =
  | 'NUMBER' | 'STRING' | 'BOOLEAN' | 'IDENT'
  | 'DOT' | 'LPAREN' | 'RPAREN' | 'LBRACKET' | 'RBRACKET' | 'COMMA'
  | 'AND' | 'OR' | 'NOT'
  | 'EQ' | 'NEQ' | 'LT' | 'LTE' | 'GT' | 'GTE'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}
```

- [ ] **Step 2: Write the failing test — `tokenizer.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { tokenize, TokenizeError } from './tokenizer';

describe('tokenize', () => {
  it('tokenizes numbers, strings, booleans, and identifiers', () => {
    const tokens = tokenize("member.dues_overdue_days > 30 && member.tags.includes('vip')");
    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      'IDENT', 'DOT', 'IDENT', 'GT', 'NUMBER', 'AND',
      'IDENT', 'DOT', 'IDENT', 'DOT', 'IDENT', 'LPAREN', 'STRING', 'RPAREN', 'EOF',
    ]);
  });

  it('tokenizes booleans as BOOLEAN not IDENT', () => {
    const tokens = tokenize('true == false');
    expect(tokens.map((t) => t.type)).toEqual(['BOOLEAN', 'EQ', 'BOOLEAN', 'EOF']);
  });

  it('tokenizes all comparison and logical operators', () => {
    const tokens = tokenize('a <= b >= c != d || e');
    expect(tokens.map((t) => t.type)).toEqual([
      'IDENT', 'LTE', 'IDENT', 'GTE', 'IDENT', 'NEQ', 'IDENT', 'OR', 'IDENT', 'EOF',
    ]);
  });

  it('tokenizes arithmetic operators', () => {
    const tokens = tokenize('a + b - c * d / e');
    expect(tokens.map((t) => t.type)).toEqual([
      'IDENT', 'PLUS', 'IDENT', 'MINUS', 'IDENT', 'STAR', 'IDENT', 'SLASH', 'IDENT', 'EOF',
    ]);
  });

  it('tokenizes negative and decimal numbers as separate MINUS + NUMBER', () => {
    const tokens = tokenize('-1.5');
    expect(tokens.map((t) => [t.type, t.value])).toEqual([
      ['MINUS', '-'], ['NUMBER', '1.5'], ['EOF', ''],
    ]);
  });

  it('throws TokenizeError on unterminated string', () => {
    expect(() => tokenize("member.name == 'vip")).toThrow(TokenizeError);
  });

  it('throws TokenizeError on an unexpected character', () => {
    expect(() => tokenize('member.name == @vip')).toThrow(TokenizeError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run lib/workflow/expression/tokenizer.test.ts`
Expected: FAIL — `Cannot find module './tokenizer'`

- [ ] **Step 4: Write `tokenizer.ts`**

```ts
import type { Token, TokenType } from './tokens';

const SINGLE_CHAR: Record<string, TokenType> = {
  '.': 'DOT', '(': 'LPAREN', ')': 'RPAREN', '[': 'LBRACKET', ']': 'RBRACKET', ',': 'COMMA',
  '+': 'PLUS', '-': 'MINUS', '*': 'STAR', '/': 'SLASH',
};

export class TokenizeError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(`${message} at position ${pos}`);
    this.pos = pos;
  }
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (ch === '&' && source[i + 1] === '&') {
      tokens.push({ type: 'AND', value: '&&', pos: i });
      i += 2;
      continue;
    }
    if (ch === '|' && source[i + 1] === '|') {
      tokens.push({ type: 'OR', value: '||', pos: i });
      i += 2;
      continue;
    }
    if (ch === '=' && source[i + 1] === '=') {
      tokens.push({ type: 'EQ', value: '==', pos: i });
      i += 2;
      continue;
    }
    if (ch === '!' && source[i + 1] === '=') {
      tokens.push({ type: 'NEQ', value: '!=', pos: i });
      i += 2;
      continue;
    }
    if (ch === '<' && source[i + 1] === '=') {
      tokens.push({ type: 'LTE', value: '<=', pos: i });
      i += 2;
      continue;
    }
    if (ch === '>' && source[i + 1] === '=') {
      tokens.push({ type: 'GTE', value: '>=', pos: i });
      i += 2;
      continue;
    }
    if (ch === '<') {
      tokens.push({ type: 'LT', value: '<', pos: i });
      i++;
      continue;
    }
    if (ch === '>') {
      tokens.push({ type: 'GT', value: '>', pos: i });
      i++;
      continue;
    }
    if (ch === '!') {
      tokens.push({ type: 'NOT', value: '!', pos: i });
      i++;
      continue;
    }

    if (ch in SINGLE_CHAR) {
      tokens.push({ type: SINGLE_CHAR[ch], value: ch, pos: i });
      i++;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let value = '';
      while (j < source.length && source[j] !== quote) {
        value += source[j];
        j++;
      }
      if (j >= source.length) throw new TokenizeError('Unterminated string literal', i);
      tokens.push({ type: 'STRING', value, pos: i });
      i = j + 1;
      continue;
    }

    if (isDigit(ch)) {
      let j = i;
      while (j < source.length && (isDigit(source[j]) || source[j] === '.')) j++;
      tokens.push({ type: 'NUMBER', value: source.slice(i, j), pos: i });
      i = j;
      continue;
    }

    if (isIdentStart(ch)) {
      let j = i;
      while (j < source.length && isIdentPart(source[j])) j++;
      const value = source.slice(i, j);
      if (value === 'true' || value === 'false') tokens.push({ type: 'BOOLEAN', value, pos: i });
      else tokens.push({ type: 'IDENT', value, pos: i });
      i = j;
      continue;
    }

    throw new TokenizeError(`Unexpected character '${ch}'`, i);
  }

  tokens.push({ type: 'EOF', value: '', pos: i });
  return tokens;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run lib/workflow/expression/tokenizer.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add web/lib/workflow/expression/tokens.ts web/lib/workflow/expression/tokenizer.ts web/lib/workflow/expression/tokenizer.test.ts
git commit -m "feat: add expression tokenizer"
```

---

## Task 4: AST and recursive-descent parser

**Files:**
- Create: `web/lib/workflow/expression/ast.ts`
- Create: `web/lib/workflow/expression/parser.ts`
- Test: `web/lib/workflow/expression/parser.test.ts`

- [ ] **Step 1: Write `ast.ts`**

```ts
export type Expr =
  | { kind: 'Logical'; op: '&&' | '||'; left: Expr; right: Expr }
  | { kind: 'Binary'; op: '==' | '!=' | '<' | '<=' | '>' | '>=' | '+' | '-' | '*' | '/'; left: Expr; right: Expr }
  | { kind: 'Unary'; op: '!' | '-'; operand: Expr }
  | { kind: 'Literal'; value: string | number | boolean }
  | { kind: 'FieldAccess'; object: Expr; property: string }
  | { kind: 'Index'; object: Expr; index: Expr }
  | { kind: 'Identifier'; name: string }
  | { kind: 'Call'; callee: Expr; args: Expr[] };
```

- [ ] **Step 2: Write the failing test — `parser.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { parse, ParseError } from './parser';

describe('parse', () => {
  it('parses a comparison', () => {
    expect(parse('member.dues_overdue_days > 30')).toEqual({
      kind: 'Binary', op: '>',
      left: { kind: 'FieldAccess', object: { kind: 'Identifier', name: 'member' }, property: 'dues_overdue_days' },
      right: { kind: 'Literal', value: 30 },
    });
  });

  it('gives && higher precedence than ||', () => {
    const ast = parse('a || b && c');
    expect(ast).toEqual({
      kind: 'Logical', op: '||',
      left: { kind: 'Identifier', name: 'a' },
      right: { kind: 'Logical', op: '&&', left: { kind: 'Identifier', name: 'b' }, right: { kind: 'Identifier', name: 'c' } },
    });
  });

  it('gives comparison higher precedence than equality', () => {
    const ast = parse('a > b == c');
    expect(ast).toEqual({
      kind: 'Binary', op: '==',
      left: { kind: 'Binary', op: '>', left: { kind: 'Identifier', name: 'a' }, right: { kind: 'Identifier', name: 'b' } },
      right: { kind: 'Identifier', name: 'c' },
    });
  });

  it('gives * higher precedence than +', () => {
    const ast = parse('a + b * c');
    expect(ast).toEqual({
      kind: 'Binary', op: '+',
      left: { kind: 'Identifier', name: 'a' },
      right: { kind: 'Binary', op: '*', left: { kind: 'Identifier', name: 'b' }, right: { kind: 'Identifier', name: 'c' } },
    });
  });

  it('parses a method call on a field access', () => {
    const ast = parse("member.tags.includes('vip')");
    expect(ast).toEqual({
      kind: 'Call',
      callee: {
        kind: 'FieldAccess',
        object: { kind: 'FieldAccess', object: { kind: 'Identifier', name: 'member' }, property: 'tags' },
        property: 'includes',
      },
      args: [{ kind: 'Literal', value: 'vip' }],
    });
  });

  it('parses index access', () => {
    const ast = parse('member.tags[0]');
    expect(ast).toEqual({
      kind: 'Index',
      object: { kind: 'FieldAccess', object: { kind: 'Identifier', name: 'member' }, property: 'tags' },
      index: { kind: 'Literal', value: 0 },
    });
  });

  it('parses parenthesized expressions overriding precedence', () => {
    const ast = parse('(a || b) && c');
    expect(ast).toEqual({
      kind: 'Logical', op: '&&',
      left: { kind: 'Logical', op: '||', left: { kind: 'Identifier', name: 'a' }, right: { kind: 'Identifier', name: 'b' } },
      right: { kind: 'Identifier', name: 'c' },
    });
  });

  it('parses unary ! and unary -', () => {
    expect(parse('!a')).toEqual({ kind: 'Unary', op: '!', operand: { kind: 'Identifier', name: 'a' } });
    expect(parse('-a')).toEqual({ kind: 'Unary', op: '-', operand: { kind: 'Identifier', name: 'a' } });
  });

  it('throws ParseError on an unclosed paren', () => {
    expect(() => parse('(a || b')).toThrow(ParseError);
  });

  it('throws ParseError on a dangling operator', () => {
    expect(() => parse('a &&')).toThrow(ParseError);
  });

  it('throws ParseError on trailing input', () => {
    expect(() => parse('a b')).toThrow(ParseError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run lib/workflow/expression/parser.test.ts`
Expected: FAIL — `Cannot find module './parser'`

- [ ] **Step 4: Write `parser.ts`**

```ts
import type { Token, TokenType } from './tokens';
import { tokenize } from './tokenizer';
import type { Expr } from './ast';

export class ParseError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(`${message} at position ${pos}`);
    this.pos = pos;
  }
}

class Parser {
  private tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private advance(): Token {
    return this.tokens[this.index++];
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private match(type: TokenType): Token | null {
    return this.check(type) ? this.advance() : null;
  }

  private expect(type: TokenType, message: string): Token {
    const token = this.match(type);
    if (!token) throw new ParseError(message, this.peek().pos);
    return token;
  }

  parseExpression(): Expr {
    const expr = this.orExpr();
    this.expect('EOF', 'Unexpected trailing input');
    return expr;
  }

  private orExpr(): Expr {
    let left = this.andExpr();
    while (this.match('OR')) left = { kind: 'Logical', op: '||', left, right: this.andExpr() };
    return left;
  }

  private andExpr(): Expr {
    let left = this.equality();
    while (this.match('AND')) left = { kind: 'Logical', op: '&&', left, right: this.equality() };
    return left;
  }

  private equality(): Expr {
    let left = this.comparison();
    while (this.check('EQ') || this.check('NEQ')) {
      const op = this.advance().type === 'EQ' ? '==' : '!=';
      left = { kind: 'Binary', op, left, right: this.comparison() };
    }
    return left;
  }

  private comparison(): Expr {
    let left = this.addExpr();
    const ops: Record<string, '<' | '<=' | '>' | '>='> = { LT: '<', LTE: '<=', GT: '>', GTE: '>=' };
    while (this.check('LT') || this.check('LTE') || this.check('GT') || this.check('GTE')) {
      const op = ops[this.advance().type];
      left = { kind: 'Binary', op, left, right: this.addExpr() };
    }
    return left;
  }

  private addExpr(): Expr {
    let left = this.mulExpr();
    while (this.check('PLUS') || this.check('MINUS')) {
      const op = this.advance().type === 'PLUS' ? '+' : '-';
      left = { kind: 'Binary', op, left, right: this.mulExpr() };
    }
    return left;
  }

  private mulExpr(): Expr {
    let left = this.unary();
    while (this.check('STAR') || this.check('SLASH')) {
      const op = this.advance().type === 'STAR' ? '*' : '/';
      left = { kind: 'Binary', op, left, right: this.unary() };
    }
    return left;
  }

  private unary(): Expr {
    if (this.match('NOT')) return { kind: 'Unary', op: '!', operand: this.unary() };
    if (this.match('MINUS')) return { kind: 'Unary', op: '-', operand: this.unary() };
    return this.primary();
  }

  private primary(): Expr {
    let expr = this.atom();
    for (;;) {
      if (this.match('DOT')) {
        const name = this.expect('IDENT', 'Expected property name after "."');
        expr = { kind: 'FieldAccess', object: expr, property: name.value };
      } else if (this.match('LBRACKET')) {
        const index = this.orExpr();
        this.expect('RBRACKET', 'Expected "]"');
        expr = { kind: 'Index', object: expr, index };
      } else if (this.match('LPAREN')) {
        const args: Expr[] = [];
        if (!this.check('RPAREN')) {
          args.push(this.orExpr());
          while (this.match('COMMA')) args.push(this.orExpr());
        }
        this.expect('RPAREN', 'Expected ")" to close call');
        expr = { kind: 'Call', callee: expr, args };
      } else {
        break;
      }
    }
    return expr;
  }

  private atom(): Expr {
    const token = this.peek();
    if (this.match('NUMBER')) return { kind: 'Literal', value: Number(token.value) };
    if (this.match('STRING')) return { kind: 'Literal', value: token.value };
    if (this.match('BOOLEAN')) return { kind: 'Literal', value: token.value === 'true' };
    if (this.match('IDENT')) return { kind: 'Identifier', name: token.value };
    if (this.match('LPAREN')) {
      const expr = this.orExpr();
      this.expect('RPAREN', 'Expected ")"');
      return expr;
    }
    throw new ParseError(`Unexpected token '${token.value || token.type}'`, token.pos);
  }
}

export function parse(source: string): Expr {
  return new Parser(tokenize(source)).parseExpression();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run lib/workflow/expression/parser.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 6: Commit**

```bash
git add web/lib/workflow/expression/ast.ts web/lib/workflow/expression/parser.ts web/lib/workflow/expression/parser.test.ts
git commit -m "feat: add recursive-descent expression parser"
```

---

## Task 5: Evaluator and mock context

**Files:**
- Create: `web/lib/workflow/expression/context.ts`
- Create: `web/lib/workflow/expression/evaluator.ts`
- Test: `web/lib/workflow/expression/evaluator.test.ts`

- [ ] **Step 1: Write `context.ts`**

```ts
export interface MemberContext {
  membership_number: string;
  name: string;
  email: string;
  tags: string[];
  dues_overdue_days: number;
  is_flagged: boolean;
  completed_profile: boolean;
}

export interface EventContext {
  name: string;
  rsvp_count: number;
  no_show_count: number;
  capacity: number;
}

export interface BookingContext {
  facility: string;
  status: string;
}

export interface EvalContext {
  member: MemberContext;
  event?: EventContext;
  booking?: BookingContext;
}
```

- [ ] **Step 2: Write the failing test — `evaluator.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { evaluate, evaluateCondition, EvalError } from './evaluator';
import { parse } from './parser';
import type { EvalContext } from './context';

const context: EvalContext = {
  member: {
    membership_number: 'VRV-0001', name: 'Ava Sinclair', email: 'ava@vrv.com',
    tags: ['vip', 'founder'], dues_overdue_days: 45, is_flagged: false, completed_profile: true,
  },
  event: { name: 'Summer Gala', rsvp_count: 40, no_show_count: 6, capacity: 50 },
};

describe('evaluate', () => {
  it('evaluates a numeric comparison', () => {
    expect(evaluate(parse('member.dues_overdue_days > 30'), context)).toBe(true);
  });

  it('evaluates boolean logic with correct precedence', () => {
    expect(evaluate(parse('member.dues_overdue_days > 60 || member.tags.includes(\'vip\')'), context)).toBe(true);
  });

  it('evaluates a method call: array includes', () => {
    expect(evaluate(parse("member.tags.includes('vip')"), context)).toBe(true);
    expect(evaluate(parse("member.tags.includes('nonmember')"), context)).toBe(false);
  });

  it('evaluates arithmetic and string concatenation', () => {
    expect(evaluate(parse('event.no_show_count / event.capacity > 0.1'), context)).toBe(true);
    expect(evaluate(parse("member.name + ' RSVP'"), context)).toBe('Ava Sinclair RSVP');
  });

  it('evaluates nested field access and equality', () => {
    expect(evaluate(parse("event.name == 'Summer Gala'"), context)).toBe(true);
  });

  it('evaluates unary negation and boolean not', () => {
    expect(evaluate(parse('!member.is_flagged'), context)).toBe(true);
    expect(evaluate(parse('-event.no_show_count'), context)).toBe(-6);
  });

  it('throws EvalError comparing a string to a number', () => {
    expect(() => evaluate(parse("member.name > 30"), context)).toThrow(EvalError);
  });

  it('throws EvalError calling an unsupported method', () => {
    expect(() => evaluate(parse("member.name.frobnicate()"), context)).toThrow(EvalError);
  });

  it('throws EvalError on an unknown top-level identifier', () => {
    expect(() => evaluate(parse('booking.status == "active"'), context)).toThrow(EvalError);
  });
});

describe('evaluateCondition', () => {
  it('parses and evaluates in one call, coercing to boolean', () => {
    expect(evaluateCondition('member.dues_overdue_days > 30', context)).toBe(true);
  });
});
```

Note: `booking` is optional on `EvalContext`; accessing `booking.status` when `booking` is `undefined` is exactly the "unknown identifier / cannot read property" path `FieldAccess` must guard.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run lib/workflow/expression/evaluator.test.ts`
Expected: FAIL — `Cannot find module './evaluator'`

- [ ] **Step 4: Write `evaluator.ts`**

```ts
import type { Expr } from './ast';
import type { EvalContext } from './context';
import { parse } from './parser';

export class EvalError extends Error {}

function toNumber(value: unknown, opDesc: string): number {
  if (typeof value !== 'number') throw new EvalError(`Expected number for ${opDesc}, got ${typeof value}`);
  return value;
}

function resolveIdentifier(name: string, context: EvalContext): unknown {
  if (!(name in context)) throw new EvalError(`Unknown identifier '${name}'`);
  return (context as unknown as Record<string, unknown>)[name];
}

function callMethod(receiver: unknown, methodName: string, args: unknown[]): unknown {
  if (methodName === 'includes' && Array.isArray(receiver)) return receiver.includes(args[0]);
  if (methodName === 'includes' && typeof receiver === 'string') return receiver.includes(String(args[0]));
  if (methodName === 'toLowerCase' && typeof receiver === 'string') return receiver.toLowerCase();
  if (methodName === 'toUpperCase' && typeof receiver === 'string') return receiver.toUpperCase();
  throw new EvalError(`Unsupported method '${methodName}' on ${typeof receiver}`);
}

export function evaluate(expr: Expr, context: EvalContext): unknown {
  switch (expr.kind) {
    case 'Literal':
      return expr.value;

    case 'Identifier':
      return resolveIdentifier(expr.name, context);

    case 'FieldAccess': {
      const object = evaluate(expr.object, context);
      if (object === null || object === undefined) {
        throw new EvalError(`Cannot read property '${expr.property}' of ${object}`);
      }
      return (object as Record<string, unknown>)[expr.property];
    }

    case 'Index': {
      const object = evaluate(expr.object, context) as unknown[];
      const index = evaluate(expr.index, context) as number;
      return object[index];
    }

    case 'Call': {
      if (expr.callee.kind !== 'FieldAccess') throw new EvalError('Only method calls are supported');
      const receiver = evaluate(expr.callee.object, context);
      const args = expr.args.map((a) => evaluate(a, context));
      return callMethod(receiver, expr.callee.property, args);
    }

    case 'Unary': {
      if (expr.op === '!') return !evaluate(expr.operand, context);
      return -toNumber(evaluate(expr.operand, context), "unary '-'");
    }

    case 'Logical': {
      const left = evaluate(expr.left, context);
      if (expr.op === '&&') return Boolean(left) && Boolean(evaluate(expr.right, context));
      return Boolean(left) || Boolean(evaluate(expr.right, context));
    }

    case 'Binary': {
      const left = evaluate(expr.left, context);
      const right = evaluate(expr.right, context);
      switch (expr.op) {
        case '==': return left === right;
        case '!=': return left !== right;
        case '<': return toNumber(left, "'<'") < toNumber(right, "'<'");
        case '<=': return toNumber(left, "'<='") <= toNumber(right, "'<='");
        case '>': return toNumber(left, "'>'") > toNumber(right, "'>'");
        case '>=': return toNumber(left, "'>='") >= toNumber(right, "'>='");
        case '+':
          if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right);
          return toNumber(left, "'+'") + toNumber(right, "'+'");
        case '-': return toNumber(left, "'-'") - toNumber(right, "'-'");
        case '*': return toNumber(left, "'*'") * toNumber(right, "'*'");
        case '/': return toNumber(left, "'/'") / toNumber(right, "'/'");
      }
    }
  }
}

export function evaluateCondition(source: string, context: EvalContext): boolean {
  return Boolean(evaluate(parse(source), context));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run lib/workflow/expression/evaluator.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 6: Commit**

```bash
git add web/lib/workflow/expression/context.ts web/lib/workflow/expression/evaluator.ts web/lib/workflow/expression/evaluator.test.ts
git commit -m "feat: add expression evaluator and mock eval context"
```

---

## Task 6: Graph validation

**Files:**
- Create: `web/lib/workflow/validation.ts`
- Test: `web/lib/workflow/validation.test.ts`

- [ ] **Step 1: Write the failing test — `validation.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { validateGraph } from './validation';
import type { WorkflowGraph } from './types';

function graph(partial: Partial<WorkflowGraph>): WorkflowGraph {
  return { schemaVersion: 1, id: 'g1', name: 'test', nodes: [], edges: [], ...partial };
}

describe('validateGraph', () => {
  it('accepts a minimal valid linear graph', () => {
    const g = graph({
      nodes: [
        { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start', description: '' } },
        { id: 'a', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Do thing', description: '' } },
      ],
      edges: [{ id: 'e1', source: 't', target: 'a' }],
    });
    const result = validateGraph(g);
    expect(result.errors).toEqual([]);
  });

  it('detects a direct cycle', () => {
    const g = graph({
      nodes: [
        { id: 'a', type: 'action', position: { x: 0, y: 0 }, data: { label: 'A', description: '' } },
        { id: 'b', type: 'action', position: { x: 0, y: 0 }, data: { label: 'B', description: '' } },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'a' }],
    });
    const result = validateGraph(g);
    expect(result.errors.some((e) => e.message.includes('Cycle detected'))).toBe(true);
  });

  it('detects a multi-node cycle', () => {
    const g = graph({
      nodes: [
        { id: 'a', type: 'action', position: { x: 0, y: 0 }, data: { label: 'A', description: '' } },
        { id: 'b', type: 'action', position: { x: 0, y: 0 }, data: { label: 'B', description: '' } },
        { id: 'c', type: 'action', position: { x: 0, y: 0 }, data: { label: 'C', description: '' } },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
        { id: 'e3', source: 'c', target: 'a' },
      ],
    });
    expect(validateGraph(g).errors.some((e) => e.message.includes('Cycle detected'))).toBe(true);
  });

  it('warns on an unreachable node', () => {
    const g = graph({
      nodes: [
        { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start', description: '' } },
        { id: 'orphan', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Orphan', description: '' } },
      ],
      edges: [],
    });
    const result = validateGraph(g);
    expect(result.warnings.some((w) => w.nodeId === 'orphan')).toBe(true);
    expect(result.errors.filter((e) => e.nodeId === 'orphan').length).toBeGreaterThan(0); // trigger with 0 out is also an error here
  });

  it('errors when a condition node is missing its false edge', () => {
    const g = graph({
      nodes: [
        { id: 'c', type: 'condition', position: { x: 0, y: 0 }, data: { label: 'Check', expression: 'true' } },
        { id: 'a', type: 'action', position: { x: 0, y: 0 }, data: { label: 'A', description: '' } },
      ],
      edges: [{ id: 'e1', source: 'c', target: 'a', sourceHandle: 'true' }],
    });
    const result = validateGraph(g);
    expect(result.errors.some((e) => e.nodeId === 'c' && e.message.includes('false'))).toBe(true);
  });

  it('errors when a branch node has fewer than 2 outgoing edges', () => {
    const g = graph({
      nodes: [
        { id: 'br', type: 'branch', position: { x: 0, y: 0 }, data: { label: 'Fan out' } },
        { id: 'a', type: 'action', position: { x: 0, y: 0 }, data: { label: 'A', description: '' } },
      ],
      edges: [{ id: 'e1', source: 'br', target: 'a' }],
    });
    expect(validateGraph(g).errors.some((e) => e.nodeId === 'br')).toBe(true);
  });

  it('errors when a merge node has fewer than 2 incoming edges', () => {
    const g = graph({
      nodes: [
        { id: 'a', type: 'action', position: { x: 0, y: 0 }, data: { label: 'A', description: '' } },
        { id: 'm', type: 'merge', position: { x: 0, y: 0 }, data: { label: 'Join' } },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'm' }],
    });
    expect(validateGraph(g).errors.some((e) => e.nodeId === 'm')).toBe(true);
  });

  it('allows an action node with 0 outgoing edges (terminal step)', () => {
    const g = graph({
      nodes: [
        { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start', description: '' } },
        { id: 'a', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Done', description: '' } },
      ],
      edges: [{ id: 'e1', source: 't', target: 'a' }],
    });
    expect(validateGraph(g).errors).toEqual([]);
  });

  it('errors when an action node has more than 1 outgoing edge', () => {
    const g = graph({
      nodes: [
        { id: 'a', type: 'action', position: { x: 0, y: 0 }, data: { label: 'A', description: '' } },
        { id: 'b', type: 'action', position: { x: 0, y: 0 }, data: { label: 'B', description: '' } },
        { id: 'c', type: 'action', position: { x: 0, y: 0 }, data: { label: 'C', description: '' } },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'a', target: 'c' }],
    });
    expect(validateGraph(g).errors.some((e) => e.nodeId === 'a')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/workflow/validation.test.ts`
Expected: FAIL — `Cannot find module './validation'`

- [ ] **Step 3: Write `validation.ts`**

```ts
import type { WorkflowGraph, WorkflowNode } from './types';

export interface ValidationIssue {
  nodeId?: string;
  edgeId?: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function outgoing(graph: WorkflowGraph, nodeId: string) {
  return graph.edges.filter((e) => e.source === nodeId);
}

function incoming(graph: WorkflowGraph, nodeId: string) {
  return graph.edges.filter((e) => e.target === nodeId);
}

function detectCycle(graph: WorkflowGraph): ValidationIssue | null {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  function visit(nodeId: string): ValidationIssue | null {
    state.set(nodeId, 'visiting');
    stack.push(nodeId);
    for (const edge of outgoing(graph, nodeId)) {
      const next = edge.target;
      if (state.get(next) === 'visiting') {
        const cycleStart = stack.indexOf(next);
        return { message: `Cycle detected: ${[...stack.slice(cycleStart), next].join(' -> ')}` };
      }
      if (state.get(next) !== 'done') {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(nodeId, 'done');
    return null;
  }

  for (const node of graph.nodes) {
    if (!state.has(node.id)) {
      const found = visit(node.id);
      if (found) return found;
    }
  }
  return null;
}

function unreachableNodes(graph: WorkflowGraph): WorkflowNode[] {
  const triggers = graph.nodes.filter((n) => n.type === 'trigger');
  const reached = new Set<string>(triggers.map((n) => n.id));
  const queue = [...reached];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of outgoing(graph, current)) {
      if (!reached.has(edge.target)) {
        reached.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return graph.nodes.filter((n) => !reached.has(n.id));
}

function checkNodeArity(graph: WorkflowGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const node of graph.nodes) {
    const out = outgoing(graph, node.id);
    const inc = incoming(graph, node.id);

    switch (node.type) {
      case 'trigger':
        if (inc.length !== 0) issues.push({ nodeId: node.id, message: 'Trigger node cannot have incoming edges' });
        if (out.length !== 1) issues.push({ nodeId: node.id, message: 'Trigger node must have exactly 1 outgoing edge' });
        break;
      case 'condition': {
        const trueEdges = out.filter((e) => e.sourceHandle === 'true');
        const falseEdges = out.filter((e) => e.sourceHandle === 'false');
        if (trueEdges.length !== 1) issues.push({ nodeId: node.id, message: 'Condition node must have exactly 1 "true" outgoing edge' });
        if (falseEdges.length !== 1) issues.push({ nodeId: node.id, message: 'Condition node must have exactly 1 "false" outgoing edge' });
        break;
      }
      case 'branch':
        if (out.length < 2) issues.push({ nodeId: node.id, message: 'Branch node must have at least 2 outgoing edges' });
        break;
      case 'merge':
        if (inc.length < 2) issues.push({ nodeId: node.id, message: 'Merge node must have at least 2 incoming edges' });
        break;
      case 'action':
      case 'delay':
        if (out.length > 1) issues.push({ nodeId: node.id, message: `${node.type} node must have at most 1 outgoing edge (use a branch node to fan out)` });
        break;
    }
  }

  return issues;
}

export function validateGraph(graph: WorkflowGraph): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const cycle = detectCycle(graph);
  if (cycle) errors.push(cycle);

  errors.push(...checkNodeArity(graph));

  for (const node of unreachableNodes(graph)) {
    warnings.push({ nodeId: node.id, message: 'Node is unreachable from any trigger' });
  }

  return { errors, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/workflow/validation.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add web/lib/workflow/validation.ts web/lib/workflow/validation.test.ts
git commit -m "feat: add graph validation (cycles, reachability, arity)"
```

---

## Task 7: Execution engine

**Files:**
- Create: `web/lib/workflow/execution/trace.ts`
- Create: `web/lib/workflow/execution/executor.ts`
- Test: `web/lib/workflow/execution/executor.test.ts`

- [ ] **Step 1: Write `trace.ts`**

```ts
import type { NodeType } from '../types';

export type StepStatus = 'ran' | 'skipped' | 'error';

export interface ExecutionStep {
  stepIndex: number;
  nodeId: string;
  nodeType: NodeType;
  status: StepStatus;
  startedAt: number;
  finishedAt: number;
  input: unknown;
  output: unknown;
  reason?: string;
}

export type RunStatus = 'idle' | 'running' | 'done' | 'error';
```

- [ ] **Step 2: Write the failing test — `executor.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWorkflow, collectTrace } from './executor';
import type { WorkflowGraph } from '../types';
import type { EvalContext } from '../expression/context';

const baseContext: EvalContext = {
  member: {
    membership_number: 'VRV-0001', name: 'Ava', email: 'ava@vrv.com',
    tags: [], dues_overdue_days: 45, is_flagged: false, completed_profile: false,
  },
};

function linearGraph(): WorkflowGraph {
  return {
    schemaVersion: 1, id: 'g', name: 'linear',
    nodes: [
      { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start', description: '' } },
      { id: 'a', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Do A', description: '' } },
      { id: 'b', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Do B', description: '' } },
    ],
    edges: [
      { id: 'e1', source: 't', target: 'a' },
      { id: 'e2', source: 'a', target: 'b' },
    ],
  };
}

function branchingGraph(): WorkflowGraph {
  return {
    schemaVersion: 1, id: 'g', name: 'branching',
    nodes: [
      { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start', description: '' } },
      { id: 'c', type: 'condition', position: { x: 0, y: 0 }, data: { label: 'Check', expression: 'member.completed_profile == false' } },
      { id: 'onTrue', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Remind', description: '' } },
      { id: 'onFalse', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Skip', description: '' } },
    ],
    edges: [
      { id: 'e1', source: 't', target: 'c' },
      { id: 'e2', source: 'c', target: 'onTrue', sourceHandle: 'true' },
      { id: 'e3', source: 'c', target: 'onFalse', sourceHandle: 'false' },
    ],
  };
}

function parallelGraph(): WorkflowGraph {
  return {
    schemaVersion: 1, id: 'g', name: 'parallel',
    nodes: [
      { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start', description: '' } },
      { id: 'br', type: 'branch', position: { x: 0, y: 0 }, data: { label: 'Fan out' } },
      { id: 'fast', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Fast', description: '' } },
      { id: 'slow', type: 'delay', position: { x: 0, y: 0 }, data: { label: 'Slow', simulatedDuration: '2d', demoMs: 1000 } },
      { id: 'm', type: 'merge', position: { x: 0, y: 0 }, data: { label: 'Join' } },
      { id: 'done', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Done', description: '' } },
    ],
    edges: [
      { id: 'e1', source: 't', target: 'br' },
      { id: 'e2', source: 'br', target: 'fast' },
      { id: 'e3', source: 'br', target: 'slow' },
      { id: 'e4', source: 'fast', target: 'm' },
      { id: 'e5', source: 'slow', target: 'm' },
      { id: 'e6', source: 'm', target: 'done' },
    ],
  };
}

describe('runWorkflow', () => {
  it('runs a linear graph in order', async () => {
    const trace = await collectTrace(linearGraph(), baseContext);
    expect(trace.map((s) => s.nodeId)).toEqual(['t', 'a', 'b']);
    expect(trace.every((s) => s.status === 'ran')).toBe(true);
  });

  it('takes the true branch and skips the false branch', async () => {
    const trace = await collectTrace(branchingGraph(), baseContext);
    const onTrue = trace.find((s) => s.nodeId === 'onTrue')!;
    const onFalse = trace.find((s) => s.nodeId === 'onFalse')!;
    expect(onTrue.status).toBe('ran');
    expect(onFalse.status).toBe('skipped');
    expect(onFalse.reason).toMatch(/not taken/i);
  });

  it('takes the false branch when the condition is false', async () => {
    const context: EvalContext = { member: { ...baseContext.member, completed_profile: true } };
    const trace = await collectTrace(branchingGraph(), context);
    expect(trace.find((s) => s.nodeId === 'onTrue')!.status).toBe('skipped');
    expect(trace.find((s) => s.nodeId === 'onFalse')!.status).toBe('ran');
  });

  it('runs branch paths concurrently — the fast path completes before the delayed sibling', async () => {
    vi.useFakeTimers();
    const steps: string[] = [];
    const gen = runWorkflow(parallelGraph(), baseContext);

    const drain = (async () => {
      for await (const step of gen) steps.push(step.nodeId);
    })();

    await vi.advanceTimersByTimeAsync(0);
    expect(steps).toContain('fast');
    expect(steps).not.toContain('slow');

    await vi.advanceTimersByTimeAsync(1000);
    await drain;

    expect(steps.indexOf('fast')).toBeLessThan(steps.indexOf('slow'));
    expect(steps.indexOf('slow')).toBeLessThan(steps.indexOf('m'));
    expect(steps).toEqual(['t', 'br', 'fast', 'slow', 'm', 'done']);
    vi.useRealTimers();
  });

  it('merge waits for both branches even though they finish at different times', async () => {
    const trace = await collectTrace(parallelGraph(), baseContext);
    const mStep = trace.find((s) => s.nodeId === 'm')!;
    const fastStep = trace.find((s) => s.nodeId === 'fast')!;
    const slowStep = trace.find((s) => s.nodeId === 'slow')!;
    expect(mStep.stepIndex).toBeGreaterThan(fastStep.stepIndex);
    expect(mStep.stepIndex).toBeGreaterThan(slowStep.stepIndex);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run lib/workflow/execution/executor.test.ts`
Expected: FAIL — `Cannot find module './executor'`

- [ ] **Step 4: Write `executor.ts`**

```ts
import type { WorkflowGraph } from '../types';
import type { EvalContext } from '../expression/context';
import { evaluateCondition } from '../expression/evaluator';
import type { ExecutionStep } from './trace';

function createSignal() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export async function* runWorkflow(graph: WorkflowGraph, context: EvalContext): AsyncGenerator<ExecutionStep> {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const outgoingOf = (id: string) => graph.edges.filter((e) => e.source === id);
  const incomingOf = (id: string) => graph.edges.filter((e) => e.target === id);

  const totalIncoming = new Map(graph.nodes.map((n) => [n.id, incomingOf(n.id).length]));
  const resolvedIncoming = new Map(graph.nodes.map((n) => [n.id, 0]));
  const deadIncoming = new Map(graph.nodes.map((n) => [n.id, 0]));
  const started = new Set<string>();

  let stepCounter = 0;
  let inFlight = 0;
  const emitted: ExecutionStep[] = [];
  let wake = createSignal();

  function notify() {
    wake.resolve();
    wake = createSignal();
  }

  function arriveEdge(targetId: string, dead: boolean) {
    resolvedIncoming.set(targetId, (resolvedIncoming.get(targetId) ?? 0) + 1);
    if (dead) deadIncoming.set(targetId, (deadIncoming.get(targetId) ?? 0) + 1);
    maybeStart(targetId);
  }

  function maybeStart(nodeId: string) {
    if (started.has(nodeId)) return;
    const total = totalIncoming.get(nodeId) ?? 0;
    const resolved = resolvedIncoming.get(nodeId) ?? 0;
    if (resolved < total) return;
    started.add(nodeId);

    const dead = deadIncoming.get(nodeId) ?? 0;
    if (total > 0 && dead === total) {
      finishSkipped(nodeId, 'Branch not taken');
      return;
    }

    inFlight++;
    void runNode(nodeId).finally(() => {
      inFlight--;
      notify();
    });
  }

  function finishSkipped(nodeId: string, reason: string) {
    const node = nodesById.get(nodeId)!;
    const now = Date.now();
    emitted.push({
      stepIndex: stepCounter++, nodeId, nodeType: node.type, status: 'skipped',
      startedAt: now, finishedAt: now, input: context, output: undefined, reason,
    });
    notify();
    for (const edge of outgoingOf(nodeId)) arriveEdge(edge.target, true);
  }

  async function runNode(nodeId: string) {
    const node = nodesById.get(nodeId)!;
    const startedAt = Date.now();
    let output: unknown;
    let reason: string | undefined;
    let takenHandle: 'true' | 'false' | undefined;

    try {
      switch (node.type) {
        case 'trigger':
          output = { firedAt: startedAt };
          break;
        case 'action':
          output = { action: node.data.label, simulated: true };
          break;
        case 'delay':
          await new Promise((resolve) => setTimeout(resolve, node.data.demoMs));
          output = { waited: node.data.simulatedDuration };
          break;
        case 'branch':
          output = { fanOut: outgoingOf(nodeId).length };
          break;
        case 'merge':
          output = { joined: incomingOf(nodeId).length };
          break;
        case 'condition': {
          const result = evaluateCondition(node.data.expression, context);
          takenHandle = result ? 'true' : 'false';
          output = result;
          reason = `Expression "${node.data.expression}" evaluated to ${result}`;
          break;
        }
      }

      emitted.push({
        stepIndex: stepCounter++, nodeId, nodeType: node.type, status: 'ran',
        startedAt, finishedAt: Date.now(), input: context, output, reason,
      });
      notify();

      for (const edge of outgoingOf(nodeId)) {
        const dead = takenHandle != null && edge.sourceHandle !== takenHandle;
        arriveEdge(edge.target, dead);
      }
    } catch (err) {
      emitted.push({
        stepIndex: stepCounter++, nodeId, nodeType: node.type, status: 'error',
        startedAt, finishedAt: Date.now(), input: context, output: undefined,
        reason: err instanceof Error ? err.message : String(err),
      });
      notify();
    }
  }

  for (const node of graph.nodes) {
    if (node.type === 'trigger') maybeStart(node.id);
  }

  let cursor = 0;
  while (true) {
    while (cursor < emitted.length) yield emitted[cursor++];
    if (inFlight === 0 && cursor >= emitted.length) break;
    await wake.promise;
  }
}

export async function collectTrace(graph: WorkflowGraph, context: EvalContext): Promise<ExecutionStep[]> {
  const steps: ExecutionStep[] = [];
  for await (const step of runWorkflow(graph, context)) steps.push(step);
  return steps;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run lib/workflow/execution/executor.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add web/lib/workflow/execution/trace.ts web/lib/workflow/execution/executor.ts web/lib/workflow/execution/executor.test.ts
git commit -m "feat: add concurrent execution engine with replayable trace"
```

---

## Task 8: Persistence

**Files:**
- Create: `web/lib/workflow/persistence.ts`
- Test: `web/lib/workflow/persistence.test.ts`

- [ ] **Step 1: Write the failing test — `persistence.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWorkflows, saveWorkflow, deleteWorkflow, loadRuns, saveRun } from './persistence';
import type { WorkflowGraph } from './types';
import type { ExecutionStep } from './execution/trace';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

const sampleGraph: WorkflowGraph = { schemaVersion: 1, id: 'wf-1', name: 'Test', nodes: [], edges: [] };

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('workflow persistence', () => {
  it('returns an empty object when nothing is saved', () => {
    expect(loadWorkflows()).toEqual({});
  });

  it('saves and reloads a workflow by id', () => {
    saveWorkflow(sampleGraph);
    expect(loadWorkflows()).toEqual({ 'wf-1': sampleGraph });
  });

  it('deletes a workflow by id', () => {
    saveWorkflow(sampleGraph);
    deleteWorkflow('wf-1');
    expect(loadWorkflows()).toEqual({});
  });
});

describe('run history persistence', () => {
  const step: ExecutionStep = {
    stepIndex: 0, nodeId: 't', nodeType: 'trigger', status: 'ran',
    startedAt: 0, finishedAt: 0, input: {}, output: {},
  };

  it('returns an empty array when no runs are saved', () => {
    expect(loadRuns('wf-1')).toEqual([]);
  });

  it('saves a run and reads it back, newest first', () => {
    saveRun('wf-1', [step]);
    saveRun('wf-1', [{ ...step, stepIndex: 1 }]);
    const runs = loadRuns('wf-1');
    expect(runs).toHaveLength(2);
    expect(runs[0][0].stepIndex).toBe(1);
  });

  it('caps run history at 5 entries per workflow', () => {
    for (let i = 0; i < 7; i++) saveRun('wf-1', [{ ...step, stepIndex: i }]);
    expect(loadRuns('wf-1')).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/workflow/persistence.test.ts`
Expected: FAIL — `Cannot find module './persistence'`

- [ ] **Step 3: Write `persistence.ts`**

```ts
import type { WorkflowGraph } from './types';
import type { ExecutionStep } from './execution/trace';

const WORKFLOWS_KEY = 'verve_automation:workflows';
const RUNS_PREFIX = 'verve_automation:runs:';
const MAX_RUNS_PER_WORKFLOW = 5;

export function loadWorkflows(): Record<string, WorkflowGraph> {
  const raw = localStorage.getItem(WORKFLOWS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, WorkflowGraph>;
  } catch {
    return {};
  }
}

export function saveWorkflow(graph: WorkflowGraph): void {
  const all = loadWorkflows();
  all[graph.id] = graph;
  localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(all));
}

export function deleteWorkflow(id: string): void {
  const all = loadWorkflows();
  delete all[id];
  localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(all));
}

export function loadRuns(workflowId: string): ExecutionStep[][] {
  const raw = localStorage.getItem(RUNS_PREFIX + workflowId);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ExecutionStep[][];
  } catch {
    return [];
  }
}

export function saveRun(workflowId: string, trace: ExecutionStep[]): void {
  const runs = loadRuns(workflowId);
  runs.unshift(trace);
  localStorage.setItem(RUNS_PREFIX + workflowId, JSON.stringify(runs.slice(0, MAX_RUNS_PER_WORKFLOW)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/workflow/persistence.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add web/lib/workflow/persistence.ts web/lib/workflow/persistence.test.ts
git commit -m "feat: add localStorage persistence for workflows and run history"
```

---

## Task 9: React Flow adapter

**Files:**
- Create: `web/lib/workflow/rf-adapter.ts`

No dedicated test file — this module is a thin, type-level mapping exercised end-to-end once the canvas is wired up in Task 15; the engine-side types it maps to/from are already covered by Tasks 2–7.

- [ ] **Step 1: Write `rf-adapter.ts`**

```ts
import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';
import type { WorkflowNode, WorkflowEdge } from './types';

export function toRFNodes(nodes: WorkflowNode[]): RFNode[] {
  return nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data as Record<string, unknown> }));
}

export function toRFEdges(edges: WorkflowEdge[]): RFEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
  }));
}

export function fromRFNodes(nodes: RFNode[]): WorkflowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type as WorkflowNode['type'],
    position: n.position,
    data: n.data as WorkflowNode['data'],
  }));
}

export function fromRFEdges(edges: RFEdge[]): WorkflowEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: (e.sourceHandle as 'true' | 'false' | null | undefined) ?? null,
  }));
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: no errors referencing `rf-adapter.ts`.

- [ ] **Step 3: Commit**

```bash
git add web/lib/workflow/rf-adapter.ts
git commit -m "feat: add WorkflowGraph <-> React Flow adapter"
```

---

## Task 10: Demo workflow examples

**Files:**
- Create: `web/lib/workflow/examples/onboarding.ts`
- Create: `web/lib/workflow/examples/overdue-dues.ts`
- Create: `web/lib/workflow/examples/no-show-followup.ts`
- Create: `web/lib/workflow/examples/index.ts`

- [ ] **Step 1: Write `onboarding.ts`**

```ts
import type { WorkflowGraph } from '../types';

export const onboardingWorkflow: WorkflowGraph = {
  schemaVersion: 1,
  id: 'example-onboarding',
  name: 'New Member Onboarding',
  nodes: [
    { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 200 }, data: { label: 'New membership created', description: 'Fires when a membership record is created' } },
    { id: 'action-welcome', type: 'action', position: { x: 240, y: 200 }, data: { label: 'Send welcome email', description: 'Welcome packet + club handbook' } },
    { id: 'delay-3d', type: 'delay', position: { x: 480, y: 200 }, data: { label: 'Wait 3 days', simulatedDuration: '3d', demoMs: 1200 } },
    { id: 'condition-profile', type: 'condition', position: { x: 720, y: 200 }, data: { label: 'Profile completed?', expression: 'member.completed_profile == false' } },
    { id: 'action-remind', type: 'action', position: { x: 960, y: 80 }, data: { label: 'Send profile reminder', description: 'Prompt to finish onboarding form' } },
    { id: 'delay-2d', type: 'delay', position: { x: 1200, y: 80 }, data: { label: 'Wait 2 days', simulatedDuration: '2d', demoMs: 1200 } },
    { id: 'action-notify-concierge', type: 'action', position: { x: 1440, y: 80 }, data: { label: 'Notify concierge', description: 'Flag for a personal follow-up call' } },
    { id: 'action-invite', type: 'action', position: { x: 960, y: 340 }, data: { label: 'Add to orientation invite list', description: '' } },
    { id: 'branch-1', type: 'branch', position: { x: 1200, y: 340 }, data: { label: 'Fan out setup tasks' } },
    { id: 'action-locker', type: 'action', position: { x: 1440, y: 260 }, data: { label: 'Assign locker', description: '' } },
    { id: 'action-concierge-call', type: 'action', position: { x: 1440, y: 420 }, data: { label: 'Schedule concierge call', description: '' } },
    { id: 'merge-1', type: 'merge', position: { x: 1680, y: 340 }, data: { label: 'Join setup tasks' } },
    { id: 'action-complete', type: 'action', position: { x: 1920, y: 340 }, data: { label: 'Mark onboarding complete', description: '' } },
  ],
  edges: [
    { id: 'e1', source: 'trigger-1', target: 'action-welcome' },
    { id: 'e2', source: 'action-welcome', target: 'delay-3d' },
    { id: 'e3', source: 'delay-3d', target: 'condition-profile' },
    { id: 'e4', source: 'condition-profile', target: 'action-remind', sourceHandle: 'true' },
    { id: 'e5', source: 'condition-profile', target: 'action-invite', sourceHandle: 'false' },
    { id: 'e6', source: 'action-remind', target: 'delay-2d' },
    { id: 'e7', source: 'delay-2d', target: 'action-notify-concierge' },
    { id: 'e8', source: 'action-invite', target: 'branch-1' },
    { id: 'e9', source: 'branch-1', target: 'action-locker' },
    { id: 'e10', source: 'branch-1', target: 'action-concierge-call' },
    { id: 'e11', source: 'action-locker', target: 'merge-1' },
    { id: 'e12', source: 'action-concierge-call', target: 'merge-1' },
    { id: 'e13', source: 'merge-1', target: 'action-complete' },
  ],
};
```

- [ ] **Step 2: Write `overdue-dues.ts`**

```ts
import type { WorkflowGraph } from '../types';

export const overdueDuesWorkflow: WorkflowGraph = {
  schemaVersion: 1,
  id: 'example-overdue-dues',
  name: 'Overdue Dues Escalation',
  nodes: [
    { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 260 }, data: { label: 'Dues overdue check', description: 'Nightly billing sweep' } },
    { id: 'condition-60', type: 'condition', position: { x: 240, y: 260 }, data: { label: 'Overdue > 60 days?', expression: 'member.dues_overdue_days > 60' } },
    { id: 'action-suspend', type: 'action', position: { x: 480, y: 80 }, data: { label: 'Suspend access', description: '' } },
    { id: 'action-notify-mgmt', type: 'action', position: { x: 720, y: 80 }, data: { label: 'Notify management', description: '' } },
    { id: 'condition-30', type: 'condition', position: { x: 480, y: 420 }, data: { label: 'Overdue > 30 days?', expression: 'member.dues_overdue_days > 30' } },
    { id: 'action-no-action', type: 'action', position: { x: 720, y: 560 }, data: { label: 'No action needed', description: '' } },
    { id: 'branch-remind', type: 'branch', position: { x: 720, y: 340 }, data: { label: 'Fan out reminders' } },
    { id: 'action-sms', type: 'action', position: { x: 960, y: 260 }, data: { label: 'Send SMS reminder', description: '' } },
    { id: 'action-email', type: 'action', position: { x: 960, y: 420 }, data: { label: 'Send email reminder', description: '' } },
    { id: 'merge-remind', type: 'merge', position: { x: 1200, y: 340 }, data: { label: 'Join reminders' } },
    { id: 'delay-7d', type: 'delay', position: { x: 1440, y: 340 }, data: { label: 'Wait 7 days', simulatedDuration: '7d', demoMs: 1200 } },
    { id: 'condition-recheck', type: 'condition', position: { x: 1680, y: 340 }, data: { label: 'Still overdue > 30 days?', expression: 'member.dues_overdue_days > 30' } },
    { id: 'action-escalate', type: 'action', position: { x: 1920, y: 260 }, data: { label: 'Escalate to collections', description: '' } },
    { id: 'action-resolved', type: 'action', position: { x: 1920, y: 420 }, data: { label: 'Mark resolved', description: '' } },
  ],
  edges: [
    { id: 'e1', source: 'trigger-1', target: 'condition-60' },
    { id: 'e2', source: 'condition-60', target: 'action-suspend', sourceHandle: 'true' },
    { id: 'e3', source: 'condition-60', target: 'condition-30', sourceHandle: 'false' },
    { id: 'e4', source: 'action-suspend', target: 'action-notify-mgmt' },
    { id: 'e5', source: 'condition-30', target: 'branch-remind', sourceHandle: 'true' },
    { id: 'e6', source: 'condition-30', target: 'action-no-action', sourceHandle: 'false' },
    { id: 'e7', source: 'branch-remind', target: 'action-sms' },
    { id: 'e8', source: 'branch-remind', target: 'action-email' },
    { id: 'e9', source: 'action-sms', target: 'merge-remind' },
    { id: 'e10', source: 'action-email', target: 'merge-remind' },
    { id: 'e11', source: 'merge-remind', target: 'delay-7d' },
    { id: 'e12', source: 'delay-7d', target: 'condition-recheck' },
    { id: 'e13', source: 'condition-recheck', target: 'action-escalate', sourceHandle: 'true' },
    { id: 'e14', source: 'condition-recheck', target: 'action-resolved', sourceHandle: 'false' },
  ],
};
```

- [ ] **Step 3: Write `no-show-followup.ts`**

```ts
import type { WorkflowGraph } from '../types';

export const noShowFollowupWorkflow: WorkflowGraph = {
  schemaVersion: 1,
  id: 'example-no-show-followup',
  name: 'Event No-Show Follow-up',
  nodes: [
    { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 200 }, data: { label: 'Event ended', description: '' } },
    { id: 'action-compute', type: 'action', position: { x: 240, y: 200 }, data: { label: 'Compute no-show list', description: '' } },
    { id: 'branch-1', type: 'branch', position: { x: 480, y: 200 }, data: { label: 'Fan out no-show tasks' } },
    { id: 'action-survey', type: 'action', position: { x: 720, y: 100 }, data: { label: 'Email no-show survey', description: '' } },
    { id: 'action-flag', type: 'action', position: { x: 720, y: 300 }, data: { label: 'Flag repeat no-shows', description: '' } },
    { id: 'merge-1', type: 'merge', position: { x: 960, y: 200 }, data: { label: 'Join no-show tasks' } },
    { id: 'condition-ratio', type: 'condition', position: { x: 1200, y: 200 }, data: { label: 'No-show ratio high?', expression: 'event.no_show_count / event.capacity > 0.3' } },
    { id: 'action-alert', type: 'action', position: { x: 1440, y: 80 }, data: { label: 'Alert events manager', description: '' } },
    { id: 'delay-1d', type: 'delay', position: { x: 1680, y: 80 }, data: { label: 'Wait 1 day', simulatedDuration: '1d', demoMs: 1200 } },
    { id: 'action-retention', type: 'action', position: { x: 1920, y: 80 }, data: { label: 'Schedule retention call', description: '' } },
    { id: 'action-archive', type: 'action', position: { x: 1440, y: 340 }, data: { label: 'Archive event report', description: '' } },
  ],
  edges: [
    { id: 'e1', source: 'trigger-1', target: 'action-compute' },
    { id: 'e2', source: 'action-compute', target: 'branch-1' },
    { id: 'e3', source: 'branch-1', target: 'action-survey' },
    { id: 'e4', source: 'branch-1', target: 'action-flag' },
    { id: 'e5', source: 'action-survey', target: 'merge-1' },
    { id: 'e6', source: 'action-flag', target: 'merge-1' },
    { id: 'e7', source: 'merge-1', target: 'condition-ratio' },
    { id: 'e8', source: 'condition-ratio', target: 'action-alert', sourceHandle: 'true' },
    { id: 'e9', source: 'condition-ratio', target: 'action-archive', sourceHandle: 'false' },
    { id: 'e10', source: 'action-alert', target: 'delay-1d' },
    { id: 'e11', source: 'delay-1d', target: 'action-retention' },
  ],
};
```

- [ ] **Step 4: Write `index.ts`**

```ts
import type { WorkflowGraph } from '../types';
import { onboardingWorkflow } from './onboarding';
import { overdueDuesWorkflow } from './overdue-dues';
import { noShowFollowupWorkflow } from './no-show-followup';

export const exampleWorkflows: WorkflowGraph[] = [onboardingWorkflow, overdueDuesWorkflow, noShowFollowupWorkflow];

export { onboardingWorkflow, overdueDuesWorkflow, noShowFollowupWorkflow };
```

- [ ] **Step 5: Add a validation smoke test and run it — `web/lib/workflow/examples/examples.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { validateGraph } from '../validation';
import { exampleWorkflows } from './index';

describe('example workflows', () => {
  it.each(exampleWorkflows)('$name has no validation errors and 8+ nodes', (graph) => {
    const result = validateGraph(graph);
    expect(result.errors).toEqual([]);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(8);
  });

  it.each(exampleWorkflows)('$name has at least one condition and one branch/merge pair', (graph) => {
    expect(graph.nodes.some((n) => n.type === 'condition')).toBe(true);
    expect(graph.nodes.some((n) => n.type === 'branch')).toBe(true);
    expect(graph.nodes.some((n) => n.type === 'merge')).toBe(true);
  });
});
```

Run: `cd web && npx vitest run lib/workflow/examples/examples.test.ts`
Expected: PASS (6 tests). If any example fails arity/cycle checks, fix that example's edges until it passes — do not weaken the test.

- [ ] **Step 6: Commit**

```bash
git add web/lib/workflow/examples/
git commit -m "feat: add three member-club demo workflows"
```

---

## Task 11: Zustand stores

**Files:**
- Create: `web/stores/useWorkflowStore.ts`
- Create: `web/stores/useExecutionStore.ts`

- [ ] **Step 1: Write `useWorkflowStore.ts`**

```ts
import { create } from 'zustand';
import type { WorkflowGraph, WorkflowNode, WorkflowEdge } from '@/lib/workflow/types';
import { validateGraph, type ValidationResult } from '@/lib/workflow/validation';
import { onboardingWorkflow } from '@/lib/workflow/examples';

interface WorkflowStore {
  graph: WorkflowGraph;
  selectedNodeId: string | null;
  validation: ValidationResult;
  loadGraph: (graph: WorkflowGraph) => void;
  setNodes: (nodes: WorkflowNode[]) => void;
  setEdges: (edges: WorkflowEdge[]) => void;
  updateNodeData: (nodeId: string, data: Partial<WorkflowNode['data']>) => void;
  selectNode: (nodeId: string | null) => void;
}

function revalidate(graph: WorkflowGraph): ValidationResult {
  return validateGraph(graph);
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  graph: onboardingWorkflow,
  selectedNodeId: null,
  validation: revalidate(onboardingWorkflow),

  loadGraph: (graph) => set({ graph, selectedNodeId: null, validation: revalidate(graph) }),

  setNodes: (nodes) => {
    const graph = { ...get().graph, nodes };
    set({ graph, validation: revalidate(graph) });
  },

  setEdges: (edges) => {
    const graph = { ...get().graph, edges };
    set({ graph, validation: revalidate(graph) });
  },

  updateNodeData: (nodeId, data) => {
    const graph = get().graph;
    const nodes = graph.nodes.map((n) => (n.id === nodeId ? ({ ...n, data: { ...n.data, ...data } } as WorkflowNode) : n));
    const nextGraph = { ...graph, nodes };
    set({ graph: nextGraph, validation: revalidate(nextGraph) });
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
}));
```

- [ ] **Step 2: Write `useExecutionStore.ts`**

```ts
import { create } from 'zustand';
import type { WorkflowGraph } from '@/lib/workflow/types';
import type { EvalContext } from '@/lib/workflow/expression/context';
import type { ExecutionStep, RunStatus } from '@/lib/workflow/execution/trace';
import { runWorkflow } from '@/lib/workflow/execution/executor';
import { saveRun } from '@/lib/workflow/persistence';

interface ExecutionStore {
  status: RunStatus;
  trace: ExecutionStep[];
  scrubIndex: number;
  run: (graph: WorkflowGraph, context: EvalContext) => Promise<void>;
  scrubTo: (index: number) => void;
  reset: () => void;
}

export const useExecutionStore = create<ExecutionStore>((set, get) => ({
  status: 'idle',
  trace: [],
  scrubIndex: -1,

  run: async (graph, context) => {
    set({ status: 'running', trace: [], scrubIndex: -1 });
    try {
      for await (const step of runWorkflow(graph, context)) {
        set((state) => ({ trace: [...state.trace, step], scrubIndex: state.trace.length }));
      }
      set({ status: 'done' });
      saveRun(graph.id, get().trace);
    } catch {
      set({ status: 'error' });
    }
  },

  scrubTo: (index) => set({ scrubIndex: index }),

  reset: () => set({ status: 'idle', trace: [], scrubIndex: -1 }),
}));
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: no errors referencing either store file.

- [ ] **Step 4: Commit**

```bash
git add web/stores/
git commit -m "feat: add workflow editing and execution Zustand stores"
```

---

## Task 12: Node components

**Files:**
- Create: `web/app/automation/components/nodes/BaseNode.tsx`
- Create: `web/app/automation/components/nodes/TriggerNode.tsx`
- Create: `web/app/automation/components/nodes/ActionNode.tsx`
- Create: `web/app/automation/components/nodes/ConditionNode.tsx`
- Create: `web/app/automation/components/nodes/DelayNode.tsx`
- Create: `web/app/automation/components/nodes/BranchNode.tsx`
- Create: `web/app/automation/components/nodes/MergeNode.tsx`
- Create: `web/app/automation/components/nodes/index.ts`

- [ ] **Step 1: Write `BaseNode.tsx`**

```tsx
export function BaseNode({
  kind, title, subtitle, selected, accent,
}: {
  kind: string; title: string; subtitle?: string; selected?: boolean; accent: string;
}) {
  return (
    <div
      className={`min-w-[180px] rounded-[10px] border px-3.5 py-3 shadow-[var(--shadow-lg)] bg-[var(--card)] text-ink ${
        selected ? 'border-gold' : 'border-[var(--hairline)]'
      }`}
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      <div className="font-ui text-[9px] font-semibold tracking-[0.12em] uppercase text-muted mb-1">{kind}</div>
      <div className="font-display text-[13px] font-semibold leading-tight">{title}</div>
      {subtitle && <div className="font-ui text-[11px] text-muted mt-1 leading-snug">{subtitle}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Write `TriggerNode.tsx`**

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TriggerData } from '@/lib/workflow/types';
import { BaseNode } from './BaseNode';

export function TriggerNode({ data, selected }: NodeProps) {
  const d = data as unknown as TriggerData;
  return (
    <>
      <BaseNode kind="Trigger" title={d.label} subtitle={d.description} selected={selected} accent="#a97c72" />
      <Handle type="source" position={Position.Right} />
    </>
  );
}
```

- [ ] **Step 3: Write `ActionNode.tsx`**

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ActionData } from '@/lib/workflow/types';
import { BaseNode } from './BaseNode';

export function ActionNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionData;
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <BaseNode kind="Action" title={d.label} subtitle={d.description} selected={selected} accent="#6fcf97" />
      <Handle type="source" position={Position.Right} />
    </>
  );
}
```

- [ ] **Step 4: Write `ConditionNode.tsx`**

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ConditionData } from '@/lib/workflow/types';
import { BaseNode } from './BaseNode';

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConditionData;
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <BaseNode kind="Condition" title={d.label} subtitle={d.expression} selected={selected} accent="#f2c94c" />
      <Handle type="source" position={Position.Bottom} id="true" style={{ left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="false" style={{ left: '70%' }} />
    </>
  );
}
```

- [ ] **Step 5: Write `DelayNode.tsx`**

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DelayData } from '@/lib/workflow/types';
import { BaseNode } from './BaseNode';

export function DelayNode({ data, selected }: NodeProps) {
  const d = data as unknown as DelayData;
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <BaseNode kind="Delay" title={d.label} subtitle={`Waits ${d.simulatedDuration}`} selected={selected} accent="#8e8e96" />
      <Handle type="source" position={Position.Right} />
    </>
  );
}
```

- [ ] **Step 6: Write `BranchNode.tsx`**

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { BranchData } from '@/lib/workflow/types';
import { BaseNode } from './BaseNode';

export function BranchNode({ data, selected }: NodeProps) {
  const d = data as unknown as BranchData;
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <BaseNode kind="Branch" title={d.label} subtitle="Runs all outgoing paths in parallel" selected={selected} accent="#c96a5e" />
      <Handle type="source" position={Position.Right} />
    </>
  );
}
```

- [ ] **Step 7: Write `MergeNode.tsx`**

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { MergeData } from '@/lib/workflow/types';
import { BaseNode } from './BaseNode';

export function MergeNode({ data, selected }: NodeProps) {
  const d = data as unknown as MergeData;
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <BaseNode kind="Merge" title={d.label} subtitle="Waits for all incoming paths" selected={selected} accent="#5e9bc9" />
      <Handle type="source" position={Position.Right} />
    </>
  );
}
```

- [ ] **Step 8: Write `index.ts`**

```ts
import { TriggerNode } from './TriggerNode';
import { ActionNode } from './ActionNode';
import { ConditionNode } from './ConditionNode';
import { DelayNode } from './DelayNode';
import { BranchNode } from './BranchNode';
import { MergeNode } from './MergeNode';

export const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
  branch: BranchNode,
  merge: MergeNode,
};
```

- [ ] **Step 9: Commit**

```bash
git add web/app/automation/components/nodes/
git commit -m "feat: add custom React Flow node components per node type"
```

---

## Task 13: Canvas

**Files:**
- Create: `web/app/automation/components/Canvas.tsx`

- [ ] **Step 1: Write `Canvas.tsx`**

```tsx
'use client';

import { useCallback, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, type Connection, type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { toRFNodes, toRFEdges, fromRFNodes, fromRFEdges } from '@/lib/workflow/rf-adapter';
import { nodeTypes } from './nodes';

export function Canvas() {
  const graph = useWorkflowStore((s) => s.graph);
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const selectNode = useWorkflowStore((s) => s.selectNode);

  const rfNodes = useMemo(() => toRFNodes(graph.nodes), [graph.nodes]);
  const rfEdges = useMemo(() => toRFEdges(graph.edges), [graph.edges]);

  const handleNodesChange = useCallback(
    (changes: unknown) => {
      void changes;
    },
    [],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const nextEdges = fromRFEdges([
        ...rfEdges,
        { id: `e-${connection.source}-${connection.target}-${Date.now()}`, ...connection },
      ]);
      setEdges(nextEdges);
    },
    [rfEdges, setEdges],
  );

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => selectNode(node.id),
    [selectNode],
  );

  void handleNodesChange;
  void fromRFNodes;
  void setNodes;

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={() => selectNode(null)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

Note on `handleNodesChange`/`fromRFNodes`/`setNodes`: dragging nodes to reposition them is a nice-to-have, not in the original spec's requirements (validation, execution, and the trace viewer are). Wiring `onNodesChange` to persist dragged positions back into `useWorkflowStore` is straightforward if you want it later — the adapter functions are already in place for it — but this plan does not require it, so the canvas renders at the fixed positions baked into each example graph.

- [ ] **Step 2: Manually verify in the browser**

Run: `cd web && npm run dev`, open `http://localhost:3000/automation` (route doesn't exist yet — this step becomes meaningful once Task 16 wires the page; skip actual browser check until then, but confirm now with `npx tsc --noEmit` that `Canvas.tsx` compiles cleanly.

Run: `cd web && npx tsc --noEmit`
Expected: no errors referencing `Canvas.tsx`.

- [ ] **Step 3: Commit**

```bash
git add web/app/automation/components/Canvas.tsx
git commit -m "feat: add React Flow canvas wired to the workflow store"
```

---

## Task 14: Toolbar and Inspector

**Files:**
- Create: `web/app/automation/components/Toolbar.tsx`
- Create: `web/app/automation/components/Inspector.tsx`

- [ ] **Step 1: Write `Toolbar.tsx`**

```tsx
'use client';

import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { useExecutionStore } from '@/stores/useExecutionStore';
import { exampleWorkflows } from '@/lib/workflow/examples';
import { demoContext } from '@/lib/workflow/examples/demo-context';

export function Toolbar() {
  const graph = useWorkflowStore((s) => s.graph);
  const loadGraph = useWorkflowStore((s) => s.loadGraph);
  const validation = useWorkflowStore((s) => s.validation);
  const runStatus = useExecutionStore((s) => s.status);
  const run = useExecutionStore((s) => s.run);

  const canRun = validation.errors.length === 0 && runStatus !== 'running';

  return (
    <div className="flex items-center gap-3 py-3 px-5 border-b border-[var(--hairline)] bg-[var(--navy)]">
      <select
        className="bg-transparent border border-[rgba(245,247,249,0.14)] rounded-md text-[12px] font-ui text-[#f5f7f9] py-1.5 px-2"
        value={graph.id}
        onChange={(e) => {
          const next = exampleWorkflows.find((w) => w.id === e.target.value);
          if (next) loadGraph(next);
        }}
      >
        {exampleWorkflows.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>

      <span className="font-ui text-[11px] text-[rgba(245,247,249,0.6)]">
        {validation.errors.length > 0
          ? `${validation.errors.length} error(s)`
          : validation.warnings.length > 0
            ? `${validation.warnings.length} warning(s)`
            : 'Valid'}
      </span>

      <button
        type="button"
        disabled={!canRun}
        onClick={() => run(graph, demoContext)}
        className="ml-auto font-ui text-[11px] font-semibold tracking-[0.08em] uppercase py-2 px-4 rounded-full bg-gold-light text-navy-deep disabled:opacity-40"
      >
        {runStatus === 'running' ? 'Running…' : 'Run'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write the missing `demoContext` fixture — `web/lib/workflow/examples/demo-context.ts`**

```ts
import type { EvalContext } from '../expression/context';

export const demoContext: EvalContext = {
  member: {
    membership_number: 'VRV-0002', name: 'Cole Bennett', email: 'cole.bennett@vrv.com',
    tags: ['new'], dues_overdue_days: 45, is_flagged: false, completed_profile: false,
  },
  event: { name: 'Founders Dinner', rsvp_count: 38, no_show_count: 14, capacity: 40 },
};
```

- [ ] **Step 3: Write `Inspector.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { parse, ParseError } from '@/lib/workflow/expression/parser';

export function Inspector() {
  const graph = useWorkflowStore((s) => s.graph);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);

  const node = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const [expressionDraft, setExpressionDraft] = useState('');
  const parseError = useMemo(() => {
    if (node?.type !== 'condition') return null;
    try {
      parse(expressionDraft || node.data.expression);
      return null;
    } catch (err) {
      return err instanceof ParseError ? err.message : String(err);
    }
  }, [expressionDraft, node]);

  if (!node) {
    return <div className="p-5 font-ui text-[12px] text-muted">Select a node to inspect it.</div>;
  }

  return (
    <div className="p-5 flex flex-col gap-3">
      <div className="font-ui text-[10px] font-semibold tracking-[0.12em] uppercase text-muted">{node.type}</div>
      <div className="font-display text-[15px] font-semibold">{node.data.label}</div>

      {node.type === 'condition' && (
        <div className="flex flex-col gap-1.5">
          <label className="font-ui text-[11px] text-muted">Expression</label>
          <input
            className="font-mono text-[12px] py-1.5 px-2 rounded-md border border-[var(--hairline)] bg-[var(--card)] text-ink"
            defaultValue={node.data.expression}
            onChange={(e) => {
              setExpressionDraft(e.target.value);
              if (!parseError) updateNodeData(node.id, { expression: e.target.value });
            }}
          />
          {parseError && <span className="font-ui text-[11px] text-[#c96a5e]">{parseError}</span>}
        </div>
      )}

      {(node.type === 'action' || node.type === 'trigger') && (
        <p className="font-ui text-[12px] text-muted">{node.data.description}</p>
      )}

      {node.type === 'delay' && (
        <p className="font-ui text-[12px] text-muted">Simulated wait: {node.data.simulatedDuration}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd web && npx tsc --noEmit`
Expected: no errors referencing `Toolbar.tsx`, `Inspector.tsx`, or `demo-context.ts`.

- [ ] **Step 5: Commit**

```bash
git add web/app/automation/components/Toolbar.tsx web/app/automation/components/Inspector.tsx web/lib/workflow/examples/demo-context.ts
git commit -m "feat: add workflow toolbar and node inspector"
```

---

## Task 15: Execution panel

**Files:**
- Create: `web/app/automation/components/ExecutionPanel.tsx`

- [ ] **Step 1: Write `ExecutionPanel.tsx`**

```tsx
'use client';

import { useExecutionStore } from '@/stores/useExecutionStore';

const STATUS_LABEL: Record<string, string> = {
  ran: 'Ran', skipped: 'Skipped', error: 'Error',
};

export function ExecutionPanel() {
  const { status, trace, scrubIndex, scrubTo } = useExecutionStore();

  if (status === 'idle') {
    return <div className="p-5 font-ui text-[12px] text-muted">Run the workflow to see the execution trace.</div>;
  }

  const activeStep = scrubIndex >= 0 ? trace[scrubIndex] : null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-[var(--hairline)]">
        <input
          type="range"
          min={0}
          max={Math.max(trace.length - 1, 0)}
          value={Math.max(scrubIndex, 0)}
          onChange={(e) => scrubTo(Number(e.target.value))}
          className="w-full"
        />
        <div className="font-ui text-[11px] text-muted mt-1">
          Step {Math.max(scrubIndex + 1, 0)} of {trace.length}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {trace.map((step, i) => (
          <li
            key={step.stepIndex}
            onClick={() => scrubTo(i)}
            className={`px-4 py-2.5 border-b border-[rgba(var(--ink-rgb),0.06)] cursor-pointer font-ui text-[12px] ${
              i === scrubIndex ? 'bg-[rgba(var(--gold-dim-rgb),0.1)]' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{step.nodeId}</span>
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted">{STATUS_LABEL[step.status]}</span>
            </div>
            {step.reason && <div className="text-muted mt-0.5">{step.reason}</div>}
          </li>
        ))}
      </ul>

      {activeStep && (
        <div className="p-4 border-t border-[var(--hairline)] font-mono text-[11px] text-muted whitespace-pre-wrap">
          {JSON.stringify({ output: activeStep.output }, null, 2)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd web && npx tsc --noEmit`
Expected: no errors referencing `ExecutionPanel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add web/app/automation/components/ExecutionPanel.tsx
git commit -m "feat: add execution trace panel with scrubber"
```

---

## Task 16: Route page and manual verification

**Files:**
- Create: `web/app/automation/page.tsx`
- Create: `web/app/automation/automation.css`

- [ ] **Step 1: Write `automation.css`**

```css
.automation-page {
  --panel-width: 320px;
}
```

- [ ] **Step 2: Write `page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { Inspector } from './components/Inspector';
import { ExecutionPanel } from './components/ExecutionPanel';
import './automation.css';

type PanelTab = 'inspector' | 'log';

export default function AutomationPage() {
  const [tab, setTab] = useState<PanelTab>('inspector');

  return (
    <div className="automation-page h-screen w-full flex flex-col bg-bg text-ink">
      <Toolbar />
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0">
          <Canvas />
        </div>
        <div className="w-[var(--panel-width)] shrink-0 border-l border-[var(--hairline)] flex flex-col">
          <div className="flex border-b border-[var(--hairline)]">
            {(['inspector', 'log'] as PanelTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 font-ui text-[11px] font-semibold tracking-[0.1em] uppercase ${
                  tab === t ? 'text-ink border-b-2 border-gold' : 'text-muted'
                }`}
              >
                {t === 'inspector' ? 'Inspector' : 'Execution Log'}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {tab === 'inspector' ? <Inspector /> : <ExecutionPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run the full test suite**

Run: `cd web && npm test`
Expected: all engine tests pass (tokenizer, parser, evaluator, validation, executor, persistence, examples).

- [ ] **Step 4: Manually verify in the browser**

Run: `cd web && npm run dev`, open `http://localhost:3000/automation`.

Check:
- Canvas loads with the "New Member Onboarding" example populated (not empty).
- Switching the dropdown loads the other two examples.
- Clicking a node shows its fields in the Inspector tab; editing a condition's expression with a syntax error shows the parse error inline.
- Clicking Run disables the button, streams steps into the Execution Log tab as they happen (the parallel branch/merge examples should visibly interleave), and the scrubber lets you step back through completed steps.
- An intentionally broken graph (temporarily delete an edge from a condition node in the browser dev tools store, or note this for manual code review) shows a non-zero error count in the toolbar and blocks Run.

- [ ] **Step 5: Commit**

```bash
git add web/app/automation/page.tsx web/app/automation/automation.css
git commit -m "feat: add /automation route wiring canvas, toolbar, inspector, and execution log"
```

---

## Task 17: README documentation

**Files:**
- Modify: `README.md` (repo root)

- [ ] **Step 1: Add a section to the root `README.md`**

Append a new section (after "Features", before "Running locally" — adjust to wherever it reads best given the current file):

```markdown
## Workflow automation engine

A hand-built workflow automation engine lives at `/automation` in the `web/` Next.js app — a typed graph model, cycle/type validation, a hand-written recursive-descent expression parser/evaluator, and a concurrent async execution engine with a replayable trace, wrapped in a React Flow canvas. No backend, no external services — everything runs and persists (`localStorage`) client-side.

See `docs/superpowers/specs/2026-08-04-workflow-automation-engine-design.md` for the full design: the graph data model, the expression grammar, how execution ordering and branching are resolved, and the trade-offs made along the way.

Run it locally:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000/automation`. Run the engine's own test suite with `cd web && npm test`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document the workflow automation engine in the root README"
```

---

## Self-Review Notes

- **Spec coverage**: graph model (Task 2), validation incl. cycle/reachability/arity (Task 6), expression tokenizer/parser/evaluator (Tasks 3–5), execution engine with topological+concurrent scheduling, branch skip logic, and real-timer delays (Task 7), execution trace/log with scrubbing (Tasks 11, 15), 3 demo workflows with 8+ nodes/condition/branch+merge (Task 10), persistence (Task 8), no-empty-canvas-by-default (Task 11's store default + Task 16), TypeScript strict/no `any` in engine core (all engine files use `unknown` + narrowing, never `any`), README doc section (Task 17).
- **Placeholder scan**: no TBDs; the one deliberately deferred item (drag-to-reposition persisting node positions) is called out explicitly in Task 13 as out of the original spec's scope, not left vague.
- **Type consistency checked**: `WorkflowGraph`/`WorkflowNode`/`WorkflowEdge` (Task 2) match usage in validation (Task 6), executor (Task 7), persistence (Task 8), examples (Task 10), adapter (Task 9), and stores (Task 11). `ExecutionStep`/`RunStatus` (Task 7) match `useExecutionStore` (Task 11) and `ExecutionPanel` (Task 15). `EvalContext` (Task 5) matches `demo-context.ts` (Task 14) and executor test fixtures (Task 7).
