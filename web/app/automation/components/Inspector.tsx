'use client';

import { useEffect, useState } from 'react';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { parse } from '@/lib/workflow/expression/parser';

export function Inspector() {
  const graph = useWorkflowStore((s) => s.graph);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);

  const node = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const [expressionDraft, setExpressionDraft] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (node?.type === 'condition') {
      setExpressionDraft(node.data.expression);
      setParseError(null);
    }
  }, [node?.id]);

  if (!node) {
    return <div className="p-5 font-ui text-[12px] text-muted">Select a node to inspect it.</div>;
  }

  return (
    <div className="p-5 flex flex-col gap-3">
      <div className="font-ui text-[10px] font-semibold tracking-[0.12em] uppercase text-muted">{node.type}</div>
      <div className="font-display text-[15px] font-semibold">{node.data.label}</div>

      {node.type === 'condition' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="condition-expression" className="font-ui text-[11px] text-muted">Expression</label>
          <input
            id="condition-expression"
            className="font-mono text-[12px] py-1.5 px-2 rounded-md border border-[var(--hairline)] bg-[var(--card)] text-ink"
            value={expressionDraft}
            onChange={(e) => {
              const value = e.target.value;
              setExpressionDraft(value);
              try {
                parse(value);
                setParseError(null);
                updateNodeData(node.id, { expression: value });
              } catch (err) {
                setParseError(err instanceof Error ? err.message : String(err));
              }
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
