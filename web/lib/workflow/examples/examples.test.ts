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
