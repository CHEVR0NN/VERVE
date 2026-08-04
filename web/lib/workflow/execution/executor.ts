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
