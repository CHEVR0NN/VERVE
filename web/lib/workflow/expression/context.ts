export interface MemberContext {
  membership_number: string;
  name: string;
  email: string;
  tags: string[];
  dues_overdue_days: number;
  is_flagged: boolean;
  completed_profile: boolean;
}

export interface EventContext {
  name: string;
  rsvp_count: number;
  no_show_count: number;
  capacity: number;
}

export interface BookingContext {
  facility: string;
  status: string;
}

export interface EvalContext {
  member: MemberContext;
  event?: EventContext;
  booking?: BookingContext;
}
