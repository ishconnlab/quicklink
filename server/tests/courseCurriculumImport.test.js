import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseCourseCurriculum } from '../../client/src/lib/courseCurriculum.js';

const curriculumPath = new URL('../../client/public/IshConnect_ML_Curriculum.json', import.meta.url);

function collectCode(value, output = []) {
  if (Array.isArray(value)) value.forEach((item) => collectCode(item, output));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'code' && typeof child === 'string') output.push(child);
      else collectCode(child, output);
    }
  }
  return output;
}

function collectText(value, output = []) {
  if (typeof value === 'string') {
    if (value) output.push(value);
  } else if (Array.isArray(value)) value.forEach((item) => collectText(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach((child) => collectText(child, output));
  return output;
}

test('supplied Machine Learning curriculum imports all 10 days and every original code example', async () => {
  const source = await readFile(curriculumPath, 'utf8');
  const original = JSON.parse(source);
  const parsed = parseCourseCurriculum(source);
  const lessons = parsed.course.modules[0].lessons;
  const importedCode = lessons.flatMap((lesson) => lesson.codeBlocks.map((block) => block.source));

  assert.equal(lessons.length, 10);
  assert.deepEqual(lessons.map((lesson) => lesson.title.split(' —')[0]), Array.from({ length: 10 }, (_, index) => `Day ${index + 1}`));
  assert.equal(parsed.course.lessonAccessMode, 'daily');
  assert.equal(importedCode.length, 25);
  assert.deepEqual(importedCode, collectCode(original.course));

  const importedText = lessons.map((lesson) => lesson.content).join('\n');
  const preservedCode = new Set(importedCode);
  for (const text of collectText(original.course)) {
    if (!preservedCode.has(text)) assert.ok(importedText.includes(text), `Missing curriculum text: ${text.slice(0, 100)}`);
  }
});

test('curriculum importer rejects missing learning days and invalid content sizes', () => {
  assert.throws(() => parseCourseCurriculum({ course: { title: 'Too short', days: [] } }), /between 10 and 100 learning days/);
  const invalidDays = Array.from({ length: 10 }, (_, index) => ({ day: index + 1, title: `Day ${index + 1}` }));
  invalidDays[3].day = 5;
  assert.throws(() => parseCourseCurriculum({ course: { title: 'Invalid days', days: invalidDays } }), /listed more than once|numbered consecutively/);
});
