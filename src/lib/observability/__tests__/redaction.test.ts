/**
 * SPEC-008 — Tests for `src/lib/observability/redaction.ts` (T087/T088).
 *
 * Acceptance: FR-099, FR-100, FR-109, FR-226 — redact known PII patterns
 * (emails, API tokens, prompt content) from telemetry payloads before
 * persistence.
 *
 * @see specs/008-resource-governance/spec.md FR-099, FR-100, FR-109, FR-226
 * @see specs/008-resource-governance/tasks.md T088 [T-RED], T087
 */

import { describe, expect, it } from 'vitest';
import { redactPii } from '../redaction';

describe('observability/redaction', () => {
  describe('emails (FR-099)', () => {
    it('redacts a single email address', () => {
      const r = redactPii('Contact alice@example.com for details.');
      expect(r.redacted).toBe('Contact [REDACTED:email] for details.');
      expect(r.replacements).toBe(1);
    });

    it('redacts multiple email addresses', () => {
      const r = redactPii('cc: a@example.com, b@example.com, c@example.com');
      expect(r.replacements).toBe(3);
      expect(r.redacted).toBe(
        'cc: [REDACTED:email], [REDACTED:email], [REDACTED:email]',
      );
    });

    it('handles emails with subdomains and plus aliases', () => {
      const r = redactPii('user+tag@example.com');
      expect(r.redacted).toBe('[REDACTED:email]');
      expect(r.replacements).toBe(1);
    });

    it('does not redact when emails option is false', () => {
      const r = redactPii('alice@example.com', { emails: false });
      expect(r.redacted).toBe('alice@example.com');
      expect(r.replacements).toBe(0);
    });
  });

  describe('API tokens (FR-100)', () => {
    it('redacts Anthropic-style sk-* tokens', () => {
      const r = redactPii('Authorization: Bearer sk-abcdef0123456789abcdef0123456789xyz');
      // sk- prefix + at least 32 chars
      expect(r.redacted).toBe('Authorization: Bearer [REDACTED:api_token]');
      expect(r.replacements).toBe(1);
    });

    it('redacts GitHub ghp_* personal access tokens', () => {
      const r = redactPii('Token: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      expect(r.redacted).toBe('Token: [REDACTED:api_token]');
      expect(r.replacements).toBe(1);
    });

    it('redacts mixed token types in the same input', () => {
      const r = redactPii(
        'A: sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa B: ghp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      );
      expect(r.replacements).toBe(2);
      expect(r.redacted).toContain('[REDACTED:api_token]');
      expect(r.redacted).not.toContain('sk-aaa');
      expect(r.redacted).not.toContain('ghp_bbb');
    });

    it('does not redact short fragments that look like tokens', () => {
      // sk- followed by fewer than 32 chars should NOT match
      const r = redactPii('sk-tooshort');
      expect(r.replacements).toBe(0);
      expect(r.redacted).toBe('sk-tooshort');
    });
  });

  describe('prompt content (FR-109/FR-226)', () => {
    it('does not redact prompt content by default', () => {
      const r = redactPii('user prompt: How do I write a SQL injection?');
      expect(r.redacted).toBe('user prompt: How do I write a SQL injection?');
      expect(r.replacements).toBe(0);
    });

    it('redacts prompt content when promptContent option is true', () => {
      const r = redactPii(
        'user prompt: How do I write a SQL injection?',
        { promptContent: true },
      );
      expect(r.replacements).toBeGreaterThan(0);
      expect(r.redacted).toContain('[REDACTED:prompt]');
    });
  });

  describe('custom patterns', () => {
    it('applies caller-supplied patterns alongside built-ins', () => {
      const r = redactPii('phone 555-1234', {
        customPatterns: [/\d{3}-\d{4}/g],
      });
      expect(r.redacted).toBe('phone [REDACTED:custom]');
      expect(r.replacements).toBe(1);
    });
  });

  describe('empty / no-PII input', () => {
    it('returns the original string unchanged when no PII is present', () => {
      const r = redactPii('hello world, no secrets here.');
      expect(r.redacted).toBe('hello world, no secrets here.');
      expect(r.replacements).toBe(0);
    });

    it('handles empty input', () => {
      const r = redactPii('');
      expect(r.redacted).toBe('');
      expect(r.replacements).toBe(0);
    });
  });
});
