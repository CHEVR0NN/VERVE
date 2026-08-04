import type { EvalContext } from '../expression/context';

export const demoContext: EvalContext = {
  member: {
    membership_number: 'VRV-0002', name: 'Cole Bennett', email: 'cole.bennett@vrv.com',
    tags: ['new'], dues_overdue_days: 45, is_flagged: false, completed_profile: false,
  },
  event: { name: 'Founders Dinner', rsvp_count: 38, no_show_count: 14, capacity: 40 },
};
