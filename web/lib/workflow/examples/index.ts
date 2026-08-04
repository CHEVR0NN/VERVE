import type { WorkflowGraph } from '../types';
import { onboardingWorkflow } from './onboarding';
import { overdueDuesWorkflow } from './overdue-dues';
import { noShowFollowupWorkflow } from './no-show-followup';

export const exampleWorkflows: WorkflowGraph[] = [onboardingWorkflow, overdueDuesWorkflow, noShowFollowupWorkflow];

export { onboardingWorkflow, overdueDuesWorkflow, noShowFollowupWorkflow };
