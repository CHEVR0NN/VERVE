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

  it('marks a node as errored when its expression throws', async () => {
    const graph: WorkflowGraph = {
      schemaVersion: 1, id: 'g', name: 'erroring',
      nodes: [
        { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Start', description: '' } },
        { id: 'c', type: 'condition', position: { x: 0, y: 0 }, data: { label: 'Check', expression: 'nonexistent.field == 1' } },
      ],
      edges: [{ id: 'e1', source: 't', target: 'c' }],
    };
    const trace = await collectTrace(graph, baseContext);
    const cStep = trace.find((s) => s.nodeId === 'c')!;
    expect(cStep.status).toBe('error');
    expect(cStep.reason).toMatch(/nonexistent/i);
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
