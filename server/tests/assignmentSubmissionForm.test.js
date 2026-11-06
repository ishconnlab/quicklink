import assert from 'node:assert/strict';
import test from 'node:test';
import { parseForm } from '../src/routes/assignmentRoutes.js';

function runParser(body) {
  const req = { body };
  let error;
  let calledNext = false;
  parseForm(req, {}, (value) => {
    error = value;
    calledNext = true;
  });
  return { req, error, calledNext };
}

test('multipart assignment submissions parse their links and draft flag', () => {
  const result = runParser({ response: 'Finished', links: '["https://example.com/project"]', draft: 'false' });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.req.body.links, ['https://example.com/project']);
  assert.equal(result.req.body.draft, false);
});

test('invalid submission links report their specific field path', () => {
  const result = runParser({ links: '["not-a-url"]', draft: 'false' });
  assert.equal(result.error.statusCode, 400);
  assert.equal(result.error.message, 'Submission form is invalid.');
  assert.equal(result.error.details[0].path, 'links.0');
});

test('malformed submission JSON reports the offending field', () => {
  const result = runParser({ links: '[', draft: 'false' });
  assert.equal(result.error.statusCode, 400);
  assert.match(result.error.message, /links/);
  assert.equal(result.error.details[0].path, 'links');
});
