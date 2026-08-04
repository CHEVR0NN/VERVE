import { describe, expect, it } from 'vitest';
import { evaluate, evaluateCondition, EvalError } from './evaluator';
import { parse } from './parser';
import type { EvalContext } from './context';

const context: EvalContext = {
  member: {
    membership_number: 'VRV-0001', name: 'Ava Sinclair', email: 'ava@vrv.com',
    tags: ['vip', 'founder'], dues_overdue_days: 45, is_flagged: false, completed_profile: true,
  },
  event: { name: 'Summer Gala', rsvp_count: 40, no_show_count: 6, capacity: 50 },
};

describe('evaluate', () => {
  it('evaluates a numeric comparison', () => {
    expect(evaluate(parse('member.dues_overdue_days > 30'), context)).toBe(true);
  });

  it('evaluates boolean logic with correct precedence', () => {
    expect(evaluate(parse('member.dues_overdue_days > 60 || member.tags.includes(\'vip\')'), context)).toBe(true);
  });

  it('evaluates a method call: array includes', () => {
    expect(evaluate(parse("member.tags.includes('vip')"), context)).toBe(true);
    expect(evaluate(parse("member.tags.includes('nonmember')"), context)).toBe(false);
  });

  it('evaluates arithmetic and string concatenation', () => {
    expect(evaluate(parse('event.no_show_count / event.capacity > 0.1'), context)).toBe(true);
    expect(evaluate(parse("member.name + ' RSVP'"), context)).toBe('Ava Sinclair RSVP');
  });

  it('evaluates nested field access and equality', () => {
    expect(evaluate(parse("event.name == 'Summer Gala'"), context)).toBe(true);
  });

  it('evaluates unary negation and boolean not', () => {
    expect(evaluate(parse('!member.is_flagged'), context)).toBe(true);
    expect(evaluate(parse('-event.no_show_count'), context)).toBe(-6);
  });

  it('evaluates index access', () => {
    expect(evaluate(parse('member.tags[0]'), context)).toBe('vip');
  });

  it('evaluates the remaining comparison, equality, arithmetic, and logical operators', () => {
    expect(evaluate(parse('event.no_show_count < event.rsvp_count'), context)).toBe(true);
    expect(evaluate(parse('event.no_show_count <= 6'), context)).toBe(true);
    expect(evaluate(parse('event.rsvp_count >= 40'), context)).toBe(true);
    expect(evaluate(parse("event.name != 'Winter Ball'"), context)).toBe(true);
    expect(evaluate(parse('event.rsvp_count - event.no_show_count'), context)).toBe(34);
    expect(evaluate(parse('event.no_show_count * 2'), context)).toBe(12);
    expect(evaluate(parse('member.completed_profile && member.tags.includes(\'vip\')'), context)).toBe(true);
  });

  it('throws EvalError comparing a string to a number', () => {
    expect(() => evaluate(parse("member.name > 30"), context)).toThrow(EvalError);
  });

  it('throws EvalError calling an unsupported method', () => {
    expect(() => evaluate(parse("member.name.frobnicate()"), context)).toThrow(EvalError);
  });

  it('throws EvalError indexing into an undefined value', () => {
    expect(() => evaluate(parse('member.nonexistentField[0]'), context)).toThrow(EvalError);
  });

  it('throws EvalError on an unknown top-level identifier', () => {
    expect(() => evaluate(parse('booking.status == "active"'), context)).toThrow(EvalError);
  });

  it('throws EvalError reading a property off a field that resolves to undefined (FieldAccess guard)', () => {
    const contextWithUndefinedBooking: EvalContext = { ...context, booking: undefined };
    expect(() => evaluate(parse('booking.status'), contextWithUndefinedBooking)).toThrow(EvalError);
  });
});

describe('evaluateCondition', () => {
  it('parses and evaluates in one call, coercing to boolean', () => {
    expect(evaluateCondition('member.dues_overdue_days > 30', context)).toBe(true);
  });
});
