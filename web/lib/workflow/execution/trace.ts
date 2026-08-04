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
