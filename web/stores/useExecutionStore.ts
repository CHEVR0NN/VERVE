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
  error: string | null;
  run: (graph: WorkflowGraph, context: EvalContext) => Promise<void>;
  scrubTo: (index: number) => void;
  reset: () => void;
}

export const useExecutionStore = create<ExecutionStore>((set, get) => ({
  status: 'idle',
  trace: [],
  scrubIndex: -1,
  error: null,

  run: async (graph, context) => {
    if (get().status === 'running') return;
    set({ status: 'running', trace: [], scrubIndex: -1, error: null });
    try {
      for await (const step of runWorkflow(graph, context)) {
        set((state) => ({ trace: [...state.trace, step], scrubIndex: state.trace.length }));
      }
      set({ status: 'done' });
      saveRun(graph.id, get().trace);
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  scrubTo: (index) => set({ scrubIndex: index }),

  reset: () => set({ status: 'idle', trace: [], scrubIndex: -1, error: null }),
}));
