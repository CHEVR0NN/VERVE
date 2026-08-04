'use client';

import { useExecutionStore } from '@/stores/useExecutionStore';

const STATUS_LABEL: Record<string, string> = {
  ran: 'Ran', skipped: 'Skipped', error: 'Error',
};

export function ExecutionPanel() {
  const { status, trace, scrubIndex, scrubTo } = useExecutionStore();

  if (status === 'idle') {
    return <div className="p-5 font-ui text-[12px] text-muted">Run the workflow to see the execution trace.</div>;
  }

  const activeStep = scrubIndex >= 0 ? trace[scrubIndex] : null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-[var(--hairline)]">
        <input
          type="range"
          min={0}
          max={Math.max(trace.length - 1, 0)}
          value={Math.max(scrubIndex, 0)}
          onChange={(e) => scrubTo(Number(e.target.value))}
          className="w-full"
        />
        <div className="font-ui text-[11px] text-muted mt-1">
          Step {Math.max(scrubIndex + 1, 0)} of {trace.length}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {trace.map((step, i) => (
          <li
            key={step.stepIndex}
            onClick={() => scrubTo(i)}
            className={`px-4 py-2.5 border-b border-[rgba(var(--ink-rgb),0.06)] cursor-pointer font-ui text-[12px] ${
              i === scrubIndex ? 'bg-[rgba(var(--gold-dim-rgb),0.1)]' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{step.nodeId}</span>
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted">{STATUS_LABEL[step.status]}</span>
            </div>
            {step.reason && <div className="text-muted mt-0.5">{step.reason}</div>}
          </li>
        ))}
      </ul>

      {activeStep && (
        <div className="p-4 border-t border-[var(--hairline)] font-mono text-[11px] text-muted whitespace-pre-wrap">
          {JSON.stringify({ output: activeStep.output }, null, 2)}
        </div>
      )}
    </div>
  );
}
