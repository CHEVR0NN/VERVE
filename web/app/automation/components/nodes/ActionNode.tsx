import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ActionData } from '@/lib/workflow/types';
import { BaseNode } from './BaseNode';

export function ActionNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionData;
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <BaseNode kind="Action" title={d.label} subtitle={d.description} selected={selected} accent="#6fcf97" />
      <Handle type="source" position={Position.Right} />
    </>
  );
}
