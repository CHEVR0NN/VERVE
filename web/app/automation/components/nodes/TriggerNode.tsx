import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TriggerData } from '@/lib/workflow/types';
import { BaseNode } from './BaseNode';

export function TriggerNode({ data, selected }: NodeProps) {
  const d = data as unknown as TriggerData;
  return (
    <>
      <BaseNode kind="Trigger" title={d.label} subtitle={d.description} selected={selected} accent="var(--gold-dim)" />
      <Handle type="source" position={Position.Right} />
    </>
  );
}
