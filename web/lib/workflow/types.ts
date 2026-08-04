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
