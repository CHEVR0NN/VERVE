import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ConditionData } from '@/lib/workflow/types';
import { BaseNode } from './BaseNode';

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConditionData;
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <BaseNode kind="Condition" title={d.label} subtitle={d.expression} selected={selected} accent="#f2c94c" />
      <Handle type="source" position={Position.Bottom} id="true" style={{ left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="false" style={{ left: '70%' }} />
    </>
  );
}
