import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { BranchData } from '@/lib/workflow/types';
import { BaseNode } from './BaseNode';

export function BranchNode({ data, selected }: NodeProps) {
  const d = data as unknown as BranchData;
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <BaseNode kind="Branch" title={d.label} subtitle="Runs all outgoing paths in parallel" selected={selected} accent="#c96a5e" />
      <Handle type="source" position={Position.Right} />
    </>
  );
}
