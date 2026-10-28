import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import * as CFB from 'cfb';
import { inspectDocument } from '../src/services/documentFormats.js';
import { formatAwareProgress } from '../src/services/learningProgress.js';
import { listDocuments, bookMetadataFromPath, resolveBookFile } from '../src/services/learningLibrary.js';
import { spreadsheetPreview, sanitizeGeneratedHtml } from '../src/controllers/learningController.js';

async function officeZip(format, slideXml = '<a:t>QuickLink</a:t>') {
  const zip = new JSZip();
  const entries = {
    docx: ['word/document.xml', 'wordprocessingml.document.main+xml', '<w:document><w:body><w:p><w:r><w:t>Chapter</w:t></w:r></w:p></w:body></w:document>'],
    pptx: ['ppt/presentation.xml', 'presentationml.presentation.main+xml', '<p:presentation/>'],
    xlsx: ['xl/workbook.xml', 'spreadsheetml.sheet.main+xml', '<workbook><sheets/></workbook>'],
  };
  const [mainFile, mainType, content] = entries[format];
  zip.file('[Content_Types].xml', `<Types><Override PartName="/${mainFile}" ContentType="application/vnd.openxmlformats-officedocument.${mainType}"/></Types>`);
  zip.file(mainFile, format === 'pptx' ? content : content);
  if (format === 'pptx') zip.file('ppt/slides/slide1.xml', `<p:sld><p:spTree>${slideXml}</p:spTree></p:sld>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function legacyOffice(streamName) {
  const compound = CFB.utils.cfb_new();
  CFB.utils.cfb_add(compound, `/${streamName}`, Buffer.from('QuickLink test stream'));
  return CFB.write(compound, { type: 'buffer' });
}

test('accepts valid PDF, text, and Markdown content', async () => {
  const pdf = await fs.readFile(new URL('../src/books/L3/Software%20Development/TeM_SWDWD301_Website%20Development.pdf', import.meta.url));
  assert.equal((await inspectDocument(pdf, 'intro.pdf')).format, 'pdf');
  assert.equal((await inspectDocument(Buffer.from('Lesson text\n'), 'notes.txt', 'text/plain')).format, 'txt');
  assert.equal((await inspectDocument(Buffer.from('# Lesson\n'), 'notes.md', 'text/markdown')).format, 'md');
});

for (const format of ['docx', 'pptx', 'xlsx']) {
  test(`validates OOXML ${format} package markers`, async () => {
    const mime = (await inspectDocument(await officeZip(format), `lesson.${format}`)).mimeType;
    assert.match(mime, /^application\/vnd\.openxmlformats-officedocument\./);
  });
}

for (const [format, stream] of [['doc', 'WordDocument'], ['ppt', 'PowerPoint Document'], ['xls', 'Workbook']]) {
  test(`distinguishes legacy ${format} from other OLE container files`, async () => {
    assert.equal((await inspectDocument(legacyOffice(stream), `lesson.${format}`)).format, format);
    await assert.rejects(inspectDocument(legacyOffice(stream), format === 'doc' ? 'lesson.ppt' : 'lesson.doc'));
  });
}

test('rejects unsupported, malformed, binary text, and mismatched MIME uploads', async () => {
  await assert.rejects(inspectDocument(Buffer.from('MZ executable'), 'program.exe'));
  await assert.rejects(inspectDocument(Buffer.from('not a pdf'), 'lesson.pdf'));
  await assert.rejects(inspectDocument(Buffer.from('hello'), 'lesson.pdf'));
  await assert.rejects(inspectDocument(Buffer.from([0, 1, 2, 3]), 'lesson.txt'));
  await assert.rejects(inspectDocument(Buffer.from('%PDF-1.7'), 'lesson.pdf', 'text/plain'));
  await assert.rejects(inspectDocument(Buffer.from('PK\u0003\u0004broken'), 'lesson.docx'));
});

test('empty or missing library directories do not throw and file metadata stays level-aware', async () => {
  const missing = await listDocuments(path.join(os.tmpdir(), `quicklink-missing-${Date.now()}`));
  assert.deepEqual(missing, { files: [], rootExists: false, complete: false });
  const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quicklink-empty-'));
  try { assert.deepEqual(await listDocuments(emptyDir), { files: [], rootExists: true, complete: true }); }
  finally { await fs.rmdir(emptyDir); }
  assert.equal(bookMetadataFromPath('D:/quick/server/src/books/L4/Networking/example.xlsx')?.category, 'Networking');
  assert.equal(resolveBookFile('../outside.pdf'), null);
});

test('learning progress keeps the correct position model for pages, slides, sheets, and sections', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const pdf = formatAwareProgress('pdf', { currentPage: 7, totalPages: 20 }, now);
  assert.deepEqual([pdf.positionType, pdf.positionIndex, pdf.currentPage, pdf.totalPages], ['page', 7, 7, 20]);
  const slides = formatAwareProgress('pptx', { positionIndex: 4, positionLabel: 'Slide 4' }, now);
  assert.deepEqual([slides.positionType, slides.positionIndex, slides.currentPage, slides.positionLabel], ['slide', 4, 1, 'Slide 4']);
  const sheet = formatAwareProgress('xlsx', { positionIndex: 2, positionLabel: 'Budget' }, now);
  assert.deepEqual([sheet.positionType, sheet.positionIndex, sheet.positionLabel], ['sheet', 2, 'Budget']);
  const section = formatAwareProgress('docx', { positionIndex: 3, positionLabel: 'Chapter 3' }, now);
  assert.deepEqual([section.positionType, section.positionIndex, section.positionLabel], ['section', 3, 'Chapter 3']);
  assert.equal(section.lastOpenedAt, now);
  const forward = formatAwareProgress('pdf', { positionIndex: 19, totalUnits: 20, timeSpentSeconds: 60 }, now, pdf);
  const backtrack = formatAwareProgress('pdf', { positionIndex: 2, totalUnits: 20, timeSpentSeconds: 60 }, now, forward);
  assert.equal(forward.completed, true);
  assert.equal(backtrack.positionIndex, 2);
  assert.equal(backtrack.furthestPosition, 19);
  assert.equal(backtrack.progressPercent, 95);
  assert.equal(backtrack.timeSpentSeconds, 120);
  const unknownLength = formatAwareProgress('docx', { positionIndex: 3 }, now);
  assert.equal(unknownLength.completed, false);
});

test('XLSX preview reads worksheet values safely with bounded table output', async () => {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="Lessons" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="worksheet"/></Relationships>');
  zip.file('xl/sharedStrings.xml', '<sst><si><t>Subject</t></si><si><t>&lt;script&gt;safe text&lt;/script&gt;</t></si></sst>');
  zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row></sheetData></worksheet>');
  const result = await spreadsheetPreview(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(result[0].name, 'Lessons');
  assert.deepEqual(result[0].rows[0], ['Subject', '', '<script>safe text</script>']);
});

test('DOCX generated markup drops executable tags and all source attributes', () => {
  assert.equal(sanitizeGeneratedHtml('<h1 onclick="run()">Chapter</h1><a href="javascript:run()">link</a><script>run()</script>'), '<h1>Chapter</h1><a>link</a>run()');
});
