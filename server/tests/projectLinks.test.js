import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedProjectLink } from '../src/utils/projectLinks.js';

test('accepts HTTPS GitHub and Google Drive project links', () => {
  assert.equal(isSupportedProjectLink('https://github.com/student/project'), true);
  assert.equal(isSupportedProjectLink('https://gist.github.com/student/123'), true);
  assert.equal(isSupportedProjectLink('https://drive.google.com/file/d/example/view'), true);
  assert.equal(isSupportedProjectLink('https://docs.google.com/document/d/example/edit'), true);
});

test('rejects insecure or unrelated project links', () => {
  assert.equal(isSupportedProjectLink('http://github.com/student/project'), false);
  assert.equal(isSupportedProjectLink('https://example.com/project'), false);
  assert.equal(isSupportedProjectLink('https://notgithub.com/student/project'), false);
  assert.equal(isSupportedProjectLink('not a url'), false);
});
