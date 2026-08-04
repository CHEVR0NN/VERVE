import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DelayData } from '@/lib/workflow/types';
import { BaseNode } from './BaseNode';

export function DelayNode({ data, selected }: NodeProps) {
  const d = data as unknown as DelayData;
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <BaseNode kind="Delay" title={d.label} subtitle={`Waits ${d.simulatedDuration}`} selected={selected} accent="var(--muted)" />
      <Handle type="source" position={Position.Right} />
    </>
  );
}
