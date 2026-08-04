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
