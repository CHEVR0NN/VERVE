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
