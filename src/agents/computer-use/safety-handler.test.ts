import { SafetyHandler, SafetyCheck, SafetyResult } from './safety-handler';

describe('SafetyHandler', () => {
  let handler: SafetyHandler;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    delete process.env.CUA_ALLOWED_URLS;
    handler = new SafetyHandler();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('allowlist', () => {
    it('defaults to localhost when env var is unset', () => {
      expect(handler['allowlist']).toEqual(['localhost']);
    });

    it('parses comma-separated env var', () => {
      process.env.CUA_ALLOWED_URLS = 'example.com, localhost, https://test.com';
      const newHandler = new SafetyHandler();
      expect(newHandler['allowlist']).toEqual(['example.com', 'localhost', 'https://test.com']);
    });
  });

  describe('handle', () => {
    const mockCheck: SafetyCheck = { id: '1', code: 'irrelevant_domain', message: 'test' };

    it('blocks on malicious_instructions', () => {
      const call = { pending_safety_checks: [{ ...mockCheck, code: 'malicious_instructions' }] };
      const result: SafetyResult = handler.handle(call, 'https://example.com');
      expect(result.proceed).toBe(false);
      expect(result.reason).toContain('malicious_instructions');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Blocked safety check: malicious_instructions for URL: https://example.com');
    });

    it('blocks on sensitive_domain', () => {
      const call = { pending_safety_checks: [{ ...mockCheck, code: 'sensitive_domain' }] };
      const result: SafetyResult = handler.handle(call, 'https://example.com');
      expect(result.proceed).toBe(false);
      expect(result.reason).toContain('sensitive_domain');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Blocked safety check: sensitive_domain for URL: https://example.com');
    });

    it('proceeds on irrelevant_domain when allowlisted', () => {
      const call = { pending_safety_checks: [mockCheck] };
      const result: SafetyResult = handler.handle(call, 'http://localhost');
      expect(result.proceed).toBe(true);
      expect(result.acknowledged).toEqual([mockCheck]);
    });

    it('blocks on irrelevant_domain when not allowlisted', () => {
      const call = { pending_safety_checks: [mockCheck] };
      const result: SafetyResult = handler.handle(call, 'https://blocked.com');
      expect(result.proceed).toBe(false);
      expect(result.reason).toContain('irrelevant_domain');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Blocked safety check: irrelevant_domain for URL: https://blocked.com');
    });

    it('handles multiple checks with mixed codes', () => {
      const call = {
        pending_safety_checks: [
          mockCheck,
          { ...mockCheck, code: 'other_code' }
        ]
      };
      const result: SafetyResult = handler.handle(call, 'http://localhost');
      expect(result.proceed).toBe(true);
      expect(result.acknowledged).toHaveLength(2);
    });

    it('blocks immediately on malicious_instructions even with others', () => {
      const call = {
        pending_safety_checks: [
          mockCheck,
          { ...mockCheck, code: 'malicious_instructions' }
        ]
      };
      const result: SafetyResult = handler.handle(call, 'http://localhost');
      expect(result.proceed).toBe(false);
      expect(result.reason).toContain('malicious_instructions');
    });
  });

  describe('isUrlAllowed', () => {
    it('matches hostname exactly', () => {
      process.env.CUA_ALLOWED_URLS = 'example.com';
      const newHandler = new SafetyHandler();
      expect(newHandler['isUrlAllowed']('https://example.com')).toBe(true);
      expect(newHandler['isUrlAllowed']('https://sub.example.com')).toBe(false);
    });

    it('matches hostname suffix', () => {
      process.env.CUA_ALLOWED_URLS = 'example.com';
      const newHandler = new SafetyHandler();
      expect(newHandler['isUrlAllowed']('https://sub.example.com')).toBe(true);
    });

    it('matches full URL prefix', () => {
      process.env.CUA_ALLOWED_URLS = 'https://example.com';
      const newHandler = new SafetyHandler();
      expect(newHandler['isUrlAllowed']('https://example.com/path')).toBe(true);
      expect(newHandler['isUrlAllowed']('http://example.com')).toBe(false);
    });
  });
});