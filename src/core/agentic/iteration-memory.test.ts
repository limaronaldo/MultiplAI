import { describe, it, expect } from 'bun:test';
import { IterationMemory } from './iteration-memory';
import type { AttemptRecord } from './iteration-memory';

describe('IterationMemory', () => {
  it('starts with empty attempts', () => {
    const memory = new IterationMemory();
    expect(memory.getAttempts()).toEqual([]);
    expect(memory.getFailedApproaches()).toEqual([]);
    expect(memory.hasTriedApproach('test')).toBe(false);
    expect(memory.getSummary()).toBe('Total attempts: 0\nSucceeded: 0\nFailed: 0\nFailed approaches: ');
  });

  it('adds a single attempt', () => {
    const memory = new IterationMemory();
    const record: AttemptRecord = { approach: 'fix import', success: true, details: '', timestamp: Date.now() };
    memory.addAttempt(record);
    const attempts = memory.getAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toEqual(record);
  });

  it('adds multiple attempts', () => {
    const memory = new IterationMemory();
    const record1: AttemptRecord = { approach: 'fix import', success: true };
    const record2: AttemptRecord = { approach: 'add test', success: false, details: 'test failed' };
    memory.addAttempt(record1);
    memory.addAttempt(record2);
    const attempts = memory.getAttempts();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(record2);
  });

  it('returns unique failed approaches', () => {
    const memory = new IterationMemory();
    memory.addAttempt({ approach: 'fix import', success: false, details: 'error1' });
    memory.addAttempt({ approach: 'fix import', success: false, details: 'error2' });
    memory.addAttempt({ approach: 'add test', success: false, details: 'error3' });
    expect(memory.getFailedApproaches()).toEqual(['fix import', 'add test']);
  });

  it('checks hasTriedApproach exactly', () => {
    const memory = new IterationMemory();
    memory.addAttempt({ approach: 'Fix Import', success: true });
    expect(memory.hasTriedApproach('Fix Import')).toBe(true);
    expect(memory.hasTriedApproach('fix import')).toBe(false);
    expect(memory.hasTriedApproach('different')).toBe(false);
  });

  it('generates summary with counts and failed approaches', () => {
    const memory = new IterationMemory();
    memory.addAttempt({ approach: 'fix import', success: true });
    memory.addAttempt({ approach: 'add test', success: false, details: 'test failed' });
    const summary = memory.getSummary();
    expect(summary).toBe('Total attempts: 2\nSucceeded: 1\nFailed: 1\nFailed approaches: add test');
  });

  it('handles no failed approaches in summary', () => {
    const memory = new IterationMemory();
    memory.addAttempt({ approach: 'fix import', success: true });
    const summary = memory.getSummary();
    expect(summary).toBe('Total attempts: 1\nSucceeded: 1\nFailed: 0\nFailed approaches: ');
  });

  it('handles all failed approaches in summary', () => {
    const memory = new IterationMemory();
    memory.addAttempt({ approach: 'fix import', success: false, details: 'error' });
    memory.addAttempt({ approach: 'add test', success: false, details: 'fail' });
    const summary = memory.getSummary();
    expect(summary).toBe('Total attempts: 2\nSucceeded: 0\nFailed: 2\nFailed approaches: fix import, add test');
  });

  it('handles optional fields in AttemptRecord', () => {
    const memory = new IterationMemory();
    memory.addAttempt({ approach: 'test', success: true }); // no details or timestamp
    const attempts = memory.getAttempts();
    expect(attempts[0].details).toBeUndefined();
    expect(attempts[0].timestamp).toBeUndefined();
  });
});
