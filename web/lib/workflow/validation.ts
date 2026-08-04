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
        if (inc.length === 0 && out.length === 0) issues.push({ nodeId: node.id, message: `${node.type} node is disconnected (no incoming or outgoing edges)` });
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
