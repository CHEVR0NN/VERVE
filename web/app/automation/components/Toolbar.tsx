'use client';

import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { useExecutionStore } from '@/stores/useExecutionStore';
import { exampleWorkflows } from '@/lib/workflow/examples';
import { demoContext } from '@/lib/workflow/examples/demo-context';

export function Toolbar() {
  const graph = useWorkflowStore((s) => s.graph);
  const loadGraph = useWorkflowStore((s) => s.loadGraph);
  const validation = useWorkflowStore((s) => s.validation);
  const runStatus = useExecutionStore((s) => s.status);
  const run = useExecutionStore((s) => s.run);
  const resetExecution = useExecutionStore((s) => s.reset);

  const canRun = validation.errors.length === 0 && runStatus !== 'running';

  return (
    <div className="flex items-center gap-3 py-3 px-5 border-b border-[var(--hairline)] bg-[var(--navy)]">
      <select
        aria-label="Select example workflow"
        disabled={runStatus === 'running'}
        className="bg-transparent border border-[rgba(245,247,249,0.14)] rounded-md text-[12px] font-ui text-[#f5f7f9] py-1.5 px-2"
        value={graph.id}
        onChange={(e) => {
          const next = exampleWorkflows.find((w) => w.id === e.target.value);
          if (next) {
            loadGraph(next);
            resetExecution();
          }
        }}
      >
        {exampleWorkflows.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>

      <span className="font-ui text-[11px] text-[rgba(245,247,249,0.6)]">
        {validation.errors.length > 0
          ? `${validation.errors.length} error(s)`
          : validation.warnings.length > 0
            ? `${validation.warnings.length} warning(s)`
            : 'Valid'}
      </span>

      <button
        type="button"
        disabled={!canRun}
        onClick={() => run(graph, demoContext)}
        className="ml-auto font-ui text-[11px] font-semibold tracking-[0.08em] uppercase py-2 px-4 rounded-full bg-gold-light text-navy-deep disabled:opacity-40"
      >
        {runStatus === 'running' ? 'Running…' : 'Run'}
      </button>
    </div>
  );
}
