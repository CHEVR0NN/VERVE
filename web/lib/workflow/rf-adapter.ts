import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';
import type { WorkflowNode, WorkflowEdge } from './types';

export function toRFNodes(nodes: WorkflowNode[]): RFNode[] {
  return nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data as unknown as Record<string, unknown> }));
}

export function toRFEdges(edges: WorkflowEdge[]): RFEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
  }));
}

export function fromRFNodes(nodes: RFNode[]): WorkflowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type as WorkflowNode['type'],
    position: n.position,
    data: n.data as unknown as WorkflowNode['data'],
  })) as WorkflowNode[];
}

export function fromRFEdges(edges: RFEdge[]): WorkflowEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: (e.sourceHandle as 'true' | 'false' | null | undefined) ?? null,
  }));
}
