import { create } from 'zustand';
import type { WorkflowGraph } from '@/lib/workflow/types';
import type { EvalContext } from '@/lib/workflow/expression/context';
import type { ExecutionStep, RunStatus } from '@/lib/workflow/execution/trace';
import { runWorkflow } from '@/lib/workflow/execution/executor';
import { saveRun } from '@/lib/workflow/persistence';

interface ExecutionStore {
  status: RunStatus;
  trace: ExecutionStep[];
  scrubIndex: number;
  run: (graph: WorkflowGraph, context: EvalContext) => Promise<void>;
  scrubTo: (index: number) => void;
  reset: () => void;
}

export const useExecutionStore = create<ExecutionStore>((set, get) => ({
  status: 'idle',
  trace: [],
  scrubIndex: -1,

  run: async (graph, context) => {
    set({ status: 'running', trace: [], scrubIndex: -1 });
    try {
      for await (const step of runWorkflow(graph, context)) {
        set((state) => ({ trace: [...state.trace, step], scrubIndex: state.trace.length }));
      }
      set({ status: 'done' });
      saveRun(graph.id, get().trace);
    } catch {
      set({ status: 'error' });
    }
  },

  scrubTo: (index) => set({ scrubIndex: index }),

  reset: () => set({ status: 'idle', trace: [], scrubIndex: -1 }),
}));
