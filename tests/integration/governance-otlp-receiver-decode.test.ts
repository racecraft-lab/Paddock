/**
 * SPEC-008 — OTLP receiver decode (T253).
 *
 * Per FR-079c. Protobuf failures, 415, 405, gzip handling.
 */
import { describe, it } from 'vitest';

describe('SPEC-008 OTLP receiver decode (T253)', () => {
  it.todo('text/plain rejected with 415 unsupported_media_type');
  it.todo('GET rejected with 405 method_not_allowed');
  it.todo('malformed protobuf rejected with 400 invalid_protobuf');
  it.todo('gzip-encoded protobuf decoded successfully');
  it.todo('content-encoding: br rejected with 415');
});
