import type { WorkflowGraph } from '../types';

export const noShowFollowupWorkflow: WorkflowGraph = {
  schemaVersion: 1,
  id: 'example-no-show-followup',
  name: 'Event No-Show Follow-up',
  nodes: [
    { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 200 }, data: { label: 'Event ended', description: '' } },
    { id: 'action-compute', type: 'action', position: { x: 240, y: 200 }, data: { label: 'Compute no-show list', description: '' } },
    { id: 'branch-1', type: 'branch', position: { x: 480, y: 200 }, data: { label: 'Fan out no-show tasks' } },
    { id: 'action-survey', type: 'action', position: { x: 720, y: 100 }, data: { label: 'Email no-show survey', description: '' } },
    { id: 'action-flag', type: 'action', position: { x: 720, y: 300 }, data: { label: 'Flag repeat no-shows', description: '' } },
    { id: 'merge-1', type: 'merge', position: { x: 960, y: 200 }, data: { label: 'Join no-show tasks' } },
    { id: 'condition-ratio', type: 'condition', position: { x: 1200, y: 200 }, data: { label: 'No-show ratio high?', expression: 'event.no_show_count / event.capacity > 0.3' } },
    { id: 'action-alert', type: 'action', position: { x: 1440, y: 80 }, data: { label: 'Alert events manager', description: '' } },
    { id: 'delay-1d', type: 'delay', position: { x: 1680, y: 80 }, data: { label: 'Wait 1 day', simulatedDuration: '1d', demoMs: 1200 } },
    { id: 'action-retention', type: 'action', position: { x: 1920, y: 80 }, data: { label: 'Schedule retention call', description: '' } },
    { id: 'action-archive', type: 'action', position: { x: 1440, y: 340 }, data: { label: 'Archive event report', description: '' } },
  ],
  edges: [
    { id: 'e1', source: 'trigger-1', target: 'action-compute' },
    { id: 'e2', source: 'action-compute', target: 'branch-1' },
    { id: 'e3', source: 'branch-1', target: 'action-survey' },
    { id: 'e4', source: 'branch-1', target: 'action-flag' },
    { id: 'e5', source: 'action-survey', target: 'merge-1' },
    { id: 'e6', source: 'action-flag', target: 'merge-1' },
    { id: 'e7', source: 'merge-1', target: 'condition-ratio' },
    { id: 'e8', source: 'condition-ratio', target: 'action-alert', sourceHandle: 'true' },
    { id: 'e9', source: 'condition-ratio', target: 'action-archive', sourceHandle: 'false' },
    { id: 'e10', source: 'action-alert', target: 'delay-1d' },
    { id: 'e11', source: 'delay-1d', target: 'action-retention' },
  ],
};
