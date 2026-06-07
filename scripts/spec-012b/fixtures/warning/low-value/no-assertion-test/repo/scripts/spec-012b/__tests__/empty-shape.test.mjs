import test from 'node:test';

test('loads fixture shape', () => {
  const fixture = { ok: true };
  const serialized = JSON.stringify(fixture);
  if (!serialized) throw new Error('fixture did not serialize');
});
