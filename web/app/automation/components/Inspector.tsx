'use client';

import { useMemo, useState } from 'react';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { parse, ParseError } from '@/lib/workflow/expression/parser';

export function Inspector() {
  const graph = useWorkflowStore((s) => s.graph);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);

  const node = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const [expressionDraft, setExpressionDraft] = useState('');
  const parseError = useMemo(() => {
    if (node?.type !== 'condition') return null;
    try {
      parse(expressionDraft || node.data.expression);
      return null;
    } catch (err) {
      return err instanceof ParseError ? err.message : String(err);
    }
  }, [expressionDraft, node]);

  if (!node) {
    return <div className="p-5 font-ui text-[12px] text-muted">Select a node to inspect it.</div>;
  }

  return (
    <div className="p-5 flex flex-col gap-3">
      <div className="font-ui text-[10px] font-semibold tracking-[0.12em] uppercase text-muted">{node.type}</div>
      <div className="font-display text-[15px] font-semibold">{node.data.label}</div>

      {node.type === 'condition' && (
        <div className="flex flex-col gap-1.5">
          <label className="font-ui text-[11px] text-muted">Expression</label>
          <input
            className="font-mono text-[12px] py-1.5 px-2 rounded-md border border-[var(--hairline)] bg-[var(--card)] text-ink"
            defaultValue={node.data.expression}
            onChange={(e) => {
              setExpressionDraft(e.target.value);
              if (!parseError) updateNodeData(node.id, { expression: e.target.value });
            }}
          />
          {parseError && <span className="font-ui text-[11px] text-[#c96a5e]">{parseError}</span>}
        </div>
      )}

      {(node.type === 'action' || node.type === 'trigger') && (
        <p className="font-ui text-[12px] text-muted">{node.data.description}</p>
      )}

      {node.type === 'delay' && (
        <p className="font-ui text-[12px] text-muted">Simulated wait: {node.data.simulatedDuration}</p>
      )}
    </div>
  );
}
