import { create } from 'zustand';
import type { WorkflowGraph, WorkflowNode, WorkflowEdge } from '@/lib/workflow/types';
import { validateGraph, type ValidationResult } from '@/lib/workflow/validation';
import { onboardingWorkflow } from '@/lib/workflow/examples';

interface WorkflowStore {
  graph: WorkflowGraph;
  selectedNodeId: string | null;
  validation: ValidationResult;
  loadGraph: (graph: WorkflowGraph) => void;
  setNodes: (nodes: WorkflowNode[]) => void;
  setEdges: (edges: WorkflowEdge[]) => void;
  updateNodeData: (nodeId: string, data: Partial<WorkflowNode['data']>) => void;
  selectNode: (nodeId: string | null) => void;
}

function revalidate(graph: WorkflowGraph): ValidationResult {
  return validateGraph(graph);
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  graph: onboardingWorkflow,
  selectedNodeId: null,
  validation: revalidate(onboardingWorkflow),

  loadGraph: (graph) => set({ graph, selectedNodeId: null, validation: revalidate(graph) }),

  setNodes: (nodes) => {
    const graph = { ...get().graph, nodes };
    set({ graph, validation: revalidate(graph) });
  },

  setEdges: (edges) => {
    const graph = { ...get().graph, edges };
    set({ graph, validation: revalidate(graph) });
  },

  updateNodeData: (nodeId, data) => {
    const graph = get().graph;
    const nodes = graph.nodes.map((n) => (n.id === nodeId ? ({ ...n, data: { ...n.data, ...data } } as WorkflowNode) : n));
    const nextGraph = { ...graph, nodes };
    set({ graph: nextGraph, validation: revalidate(nextGraph) });
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
}));
