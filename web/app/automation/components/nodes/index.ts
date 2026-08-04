import { TriggerNode } from './TriggerNode';
import { ActionNode } from './ActionNode';
import { ConditionNode } from './ConditionNode';
import { DelayNode } from './DelayNode';
import { BranchNode } from './BranchNode';
import { MergeNode } from './MergeNode';

export const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
  branch: BranchNode,
  merge: MergeNode,
};
