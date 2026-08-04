import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { MergeData } from '@/lib/workflow/types';
import { BaseNode } from './BaseNode';

export function MergeNode({ data, selected }: NodeProps) {
  const d = data as unknown as MergeData;
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <BaseNode kind="Merge" title={d.label} subtitle="Waits for all incoming paths" selected={selected} accent="#5e9bc9" />
      <Handle type="source" position={Position.Right} />
    </>
  );
}
