# Workflow Automation Engine — Design

Portfolio feature for VERVE: a hand-built workflow graph engine (typed nodes/edges, cycle/type validation, a hand-written expression parser/evaluator, and an async execution engine with a replayable trace), wrapped in a React Flow canvas. Lives entirely in `web/` (the Next.js/React/TS rewrite), as a standalone route with no auth gate. No backend, no external services — `localStorage` only.

## 1. Graph data model

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

Plain serializable JSON, versioned via `schemaVersion` so persisted workflows can be migrated later without a rewrite. The engine (graph model, validator, evaluator, executor) never imports React Flow — a thin adapter module maps `WorkflowGraph` ⇄ React Flow's node/edge shape at the UI boundary only. This keeps the entire engine unit-testable with zero DOM/React dependency.

## 2. Validation (runs before every execution)

- **Cycle detection** — DFS with recursion-stack coloring (white/gray/black). A cycle produces a rejection listing the offending node path, not a silent hang or stack overflow.
- **Reachability** — BFS from all trigger nodes. Nodes never reached are a *warning*, not an error (dangling scratch nodes shouldn't block a run).
- **Connection type-checking**, per node type:
  - `trigger`: 0 incoming edges, exactly 1 outgoing.
  - `condition`: exactly one outgoing edge with `sourceHandle: 'true'` and exactly one with `'false'`. Any other count is an error.
  - `branch`: ≥2 outgoing edges (a branch with one child is pointless — flagged as error).
  - `merge`: ≥2 incoming edges.
  - `action` / `delay`: **at most** 1 outgoing edge (0 means a terminal step). Fan-out must go through an explicit `branch` node, so "this runs in parallel" is always a visible modeling choice, never implicit from having two edges out of an action.

`validateGraph()` returns `{ errors: ValidationIssue[], warnings: ValidationIssue[] }`, each tagged with the offending node/edge id. The canvas renders these as inline badges on the specific node; a run is blocked while `errors.length > 0`.

## 3. Expression language (Condition nodes)

Hand-written tokenizer → recursive-descent parser → AST → tree-walking evaluator. Three independently unit-tested stages, deliberately un-clever (no Pratt parsing, no precedence-climbing tables) so the recursive-descent structure maps 1:1 to the grammar and reads plainly.

```
expression  := orExpr
orExpr      := andExpr ( "||" andExpr )*
andExpr     := equality ( "&&" equality )*
equality    := comparison ( ("==" | "!=") comparison )*
comparison  := addExpr ( ("<" | "<=" | ">" | ">=") addExpr )*
addExpr     := mulExpr ( ("+" | "-") mulExpr )*
mulExpr     := unary ( ("*" | "/") unary )*
unary       := "!" unary | "-" unary | primary
primary     := NUMBER | STRING | BOOLEAN | fieldAccess | "(" expression ")" | call
fieldAccess := IDENT ( "." IDENT | "[" expression "]" )*
call        := fieldAccess "(" ( expression ("," expression)* )? ")"
```

`addExpr`/`mulExpr` give the "basic string/number ops" the original spec asked for (`+` also does string concatenation when either side is a string) — standard precedence tier added between comparison and unary, still one recursive-descent method per grammar rule.

Covers everything the demo workflows need: `member.dues_overdue_days > 30`, `member.tags.includes('vip')`, `event.no_show_count / event.capacity > 0.3 && event.rsvp_count >= 10`. Comparing a string to a number, or calling a method that isn't defined on the resolved value, throws a typed `EvalError` (caught by the executor and surfaced as a node error, not a crash).

Mock context, shaped to match the real Mongoose models in `backend/models/` plus the couple of demo-only fields the flows need:

```ts
interface EvalContext {
  member: {
    membership_number: string; name: string; email: string;
    tags: string[]; dues_overdue_days: number; is_flagged: boolean; completed_profile: boolean;
  };
  event?: { name: string; rsvp_count: number; no_show_count: number; capacity: number };
  booking?: { facility: string; status: string };
}
```

## 4. Execution engine

`runWorkflow(graph, context, options?)` is an `async function*` yielding an `ExecutionStep` each time a node finishes:

```ts
interface ExecutionStep {
  stepIndex: number;
  nodeId: string;
  nodeType: NodeType;
  status: 'ran' | 'skipped' | 'error';
  startedAt: number; finishedAt: number;
  input: unknown; output: unknown;
  reason?: string; // e.g. "condition evaluated false", "branch not taken", "merge waited for 2 branches"
}
```

**Scheduling.** Internally, each node's execution is an async task. A task's completion enqueues its `ExecutionStep` onto a shared queue and schedules whichever successors just became ready; the generator drains and yields from that queue in real completion order. This means the trace order reflects actual concurrency — if one parallel branch has a `delay` and the sibling branch doesn't, the sibling's step legitimately appears first, and the trace/UI can say so. Tests pin this down with fake timers so ordering is deterministic in CI.

- **Condition**: evaluates its expression once, marks exactly one outgoing edge "alive." Only nodes reachable *exclusively* through the dead edge are recorded as `skipped` (reason: "branch not taken"); nodes reachable from both the taken and untaken path still run once — dead edges just don't gate them.
- **Branch**: kicks off all outgoing paths concurrently (not sequentially) — this is where real `Promise`-based concurrency matters, since one path's `delay` must not block the other.
- **Merge**: waits until every one of its incoming edges is *resolved* — either its source node ran, or its source node's edge was marked dead by an upstream condition (dead edges resolve immediately, they don't block the join).
- **Delay**: node data carries both a human label (`simulatedDuration: "2d"`, for display/business meaning) and an actual `demoMs` (e.g. `1500`) — the engine does a real `await new Promise(r => setTimeout(r, demoMs))`, so it is genuinely async, not an animation. The trace shows both the simulated duration and that a real wait occurred.

**Trace vs. replay.** A run's full yielded step array is stored as-is. Scrubbing/replaying in the UI never re-invokes the engine — it just re-renders the recorded array at a given index. This is the same array whether you're watching it live (as it streams in) or reopening a past run from `localStorage`.

## 5. State management

Two Zustand stores, matching the two concerns:

- `useWorkflowStore` — the graph being edited: `nodes`, `edges`, `activeGraphId`, mutators (`addNode`, `updateNode`, `removeNode`, `connect`, `disconnect`), and the current `ValidationResult` (recomputed on every graph change).
- `useExecutionStore` — one run's lifecycle: `status: 'idle' | 'running' | 'done' | 'error'`, `trace: ExecutionStep[]`, `scrubIndex`, actions `run()` (consumes the generator, appending to `trace` as steps arrive), `scrubTo(index)`, `reset()`.

## 6. Persistence

`localStorage` only — IndexedDB is unnecessary complexity for what's a handful of small JSON graphs plus capped run history; this is a size/complexity trade-off worth naming explicitly rather than defaulting to the heavier tool.

- `verve_automation:workflows` → `Record<workflowId, WorkflowGraph>`
- `verve_automation:runs:<workflowId>` → last 5 `ExecutionStep[]` traces (capped, oldest evicted)

Both keyed under `schemaVersion`; a migration function is a no-op today but the seam exists.

## 7. UI / routing

New standalone route `web/app/automation/page.tsx`, no auth check, styled with the existing Verve design tokens (navy/gold/coral, light/dark via `[data-theme]`) already in `globals.css`. Layout:

- **Left rail** — workflow picker (3 built-in examples + any saved custom ones), Validate button, Run button.
- **Center** — React Flow canvas with a custom node component per `NodeType` (six visual variants sharing one base card style).
- **Right panel**, tab-switchable — **Inspector** (selected node's fields; for `condition`, a live-validated expression input with inline parse-error display) and **Execution Log** (step list + scrubber timeline + play/step/pause controls + per-step input/output/reason detail).

First visit loads the "New Member Onboarding" example populated on the canvas — never an empty canvas by default.

## 8. Demo workflows (member-club domain)

1. **New Member Onboarding** (~10 nodes) — welcome email → delay → condition on `completed_profile` → reminder-escalation path vs. a `branch`/`merge` pair (assign locker + schedule concierge call in parallel) → mark complete.
2. **Overdue Dues Escalation** (~11 nodes) — nested conditions on `dues_overdue_days` (>60 vs >30), a `branch`/`merge` pair for parallel SMS+email reminders, a delay, then a re-check condition before suspend/resolve.
3. **Event No-Show Follow-up** (~9 nodes) — parallel `branch` (email survey + flag repeat no-shows) → `merge` → condition on no-show ratio → escalation vs. archive.

Each has 8+ nodes, at least one condition, and at least one branch/merge parallel pair, per the original spec.

## 9. Testing plan (Vitest)

Engine core gets thorough coverage; UI gets light smoke coverage only.

- `tokenizer.test.ts` — every literal/operator/identifier, whitespace, malformed-input error cases.
- `parser.test.ts` — AST shape per grammar rule, operator precedence (`&&` vs `||`, comparison vs equality), syntax errors (unclosed paren, dangling operator).
- `evaluator.test.ts` — comparisons, boolean logic, nested field access, array `.includes()`, type-mismatch → `EvalError`.
- `validation.test.ts` — cycle detection (positive/negative, multi-node cycles), disconnected-node warnings, condition/branch/merge arity rules.
- `executor.test.ts` — linear ordering, condition taken/skipped-branch marking, branch/merge concurrency (using fake timers to assert real overlap, not just sequencing), delay actually awaiting (`vi.useFakeTimers` + `advanceTimersByTimeAsync`), execution refusing to start on an invalid graph.

## 10. Trade-offs / what I'd do differently at scale

- **`localStorage` over IndexedDB**: simplicity for a small, capped dataset; would need IndexedDB or a real backend once workflow/run volume grows past a few MB.
- **Completion-order trace** (queue-driven) over a fixed topological pass: more honestly reflects concurrent timing, at the cost of needing fake timers in tests to keep ordering deterministic.
- **Single-thread concurrency** (interleaved async, not real multi-core): fine here since nodes are I/O-simulated (timers), not CPU-bound; real parallel *execution* would need workers or server-side orchestration.
- **Deliberately small expression grammar** (no ternary, no user-defined functions, no assignment): scoped exactly to what Condition nodes need — comparisons, boolean logic, field/index access, calls, and basic arithmetic. Documented as an intentional boundary, not an oversight — a real rules engine would grow this incrementally as workflows demanded it.
- **No real side effects**: Action nodes simulate their effect (log + mock output) rather than actually sending email/SMS — appropriate for a fully offline portfolio demo; a production version would need an adapter layer per action type.
