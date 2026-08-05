import { create } from 'zustand';
import type { WorkflowGraph, WorkflowNode, WorkflowEdge } from '@/lib/workflow/types';
import { validateGraph, type ValidationResult } from '@/lib/workflow/validation';
import { onboardingWorkflow } from '@/lib/workflow/examples';
import { loadWorkflows, saveWorkflow } from '@/lib/workflow/persistence';

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

// This module is only ever imported from 'use client' components (Toolbar/Canvas/Inspector),
// but Next.js still renders client components on the server for the initial HTML, which
// evaluates this module's top-level scope there too — where `localStorage` doesn't exist.
// Guard so SSR gets the pristine example instead of crashing.
const initialGraph =
  typeof window !== 'undefined' ? loadWorkflows()[onboardingWorkflow.id] ?? onboardingWorkflow : onboardingWorkflow;

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  graph: initialGraph,
  selectedNodeId: null,
  validation: revalidate(initialGraph),

  loadGraph: (graph) => set({ graph, selectedNodeId: null, validation: revalidate(graph) }),

  setNodes: (nodes) => {
    const graph = { ...get().graph, nodes };
    saveWorkflow(graph);
    set({ graph, validation: revalidate(graph) });
  },

  setEdges: (edges) => {
    const graph = { ...get().graph, edges };
    saveWorkflow(graph);
    set({ graph, validation: revalidate(graph) });
  },

  updateNodeData: (nodeId, data) => {
    const graph = get().graph;
    const nodes = graph.nodes.map((n) => (n.id === nodeId ? ({ ...n, data: { ...n.data, ...data } } as WorkflowNode) : n));
    const nextGraph = { ...graph, nodes };
    saveWorkflow(nextGraph);
    set({ graph: nextGraph, validation: revalidate(nextGraph) });
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
}));
