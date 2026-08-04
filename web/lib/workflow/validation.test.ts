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
