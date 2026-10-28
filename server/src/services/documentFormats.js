import JSZip from 'jszip';
import * as CFB from 'cfb';
import ApiError from '../utils/ApiError.js';

export const FORMAT_MIME = Object.freeze({
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});

const OOXML_MARKERS = {
  docx: { entry: 'word/document.xml', type: 'wordprocessingml.document.main+xml' },
  pptx: { entry: 'ppt/presentation.xml', type: 'presentationml.presentation.main+xml' },
  xlsx: { entry: 'xl/workbook.xml', type: 'spreadsheetml.sheet.main+xml' },
};

function assertPlainText(buffer) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw ApiError.badRequest('Text document is not valid UTF-8.'); }
  if ([...text].some((char) => {
    const code = char.codePointAt(0);
    return code === 0 || (code < 32 && ![9, 10, 12, 13].includes(code));
  })) throw ApiError.badRequest('The file contains binary data, not a text document.');
}

function validateDeclaredMime(format, declaredMime) {
  if (!declaredMime) return;
  const accepted = new Set([FORMAT_MIME[format]]);
  if (format === 'md') accepted.add('text/plain');
  if (format === 'docx' || format === 'pptx' || format === 'xlsx') accepted.add('application/zip');
  if (!accepted.has(declaredMime.toLowerCase())) {
    throw ApiError.badRequest(`The provided MIME type does not match .${format} documents.`);
  }
}

export async function inspectDocument(buffer, fileName, declaredMime = '') {
  const extension = String(fileName).split('.').at(-1)?.toLowerCase();
  const format = extension && extension !== fileName.toLowerCase() ? extension : '';
  if (!format || !Object.hasOwn(FORMAT_MIME, format)) throw ApiError.badRequest('This file format is not supported.');

  const header = buffer.subarray(0, 8);
  const hasZipSignature = header.subarray(0, 4).toString('hex') === '504b0304' || header.subarray(0, 4).toString('hex') === '504b0506';
  const hasCfbSignature = header.toString('hex') === 'd0cf11e0a1b11ae1';
  const hasPdfSignature = buffer.subarray(0, 1024).toString('latin1').includes('%PDF-');
  const detectedMime = hasPdfSignature ? FORMAT_MIME.pdf : hasZipSignature ? 'application/zip' : hasCfbSignature ? 'application/x-cfb' : '';
  let valid = false;
  let metadata = null;
  if (format === 'pdf') {
    const pdfHeader = buffer.subarray(0, 1024).toString('latin1');
    const tail = buffer.subarray(Math.max(0, buffer.length - 2048)).toString('latin1');
    const body = buffer.toString('latin1');
    valid = hasPdfSignature && pdfHeader.includes('%PDF-') && tail.includes('%%EOF') && /\/Type\s*\/(?:Page|Pages)\b/.test(body);
    if (!valid) throw ApiError.badRequest('The PDF file is malformed or missing required document structures.');
  } else if (['txt', 'md'].includes(format)) {
    assertPlainText(buffer);
    valid = true;
  } else if (['docx', 'pptx', 'xlsx'].includes(format)) {
    if (!hasZipSignature) throw ApiError.badRequest(`The file content is not a valid .${format} document.`);
    let zip;
    try { zip = await JSZip.loadAsync(buffer, { checkCRC32: false, createFolders: false }); }
    catch { throw ApiError.badRequest(`The .${format} archive is corrupt.`); }
    const totalExpanded = Object.values(zip.files).reduce((sum, entry) => sum + (entry._data?.uncompressedSize || 0), 0);
    if (totalExpanded > 100 * 1024 * 1024) throw ApiError.badRequest('The document expands beyond the permitted preview size.');
    const marker = OOXML_MARKERS[format];
    const typesFile = zip.file('[Content_Types].xml');
    const types = typesFile && await typesFile.async('string');
    valid = Boolean(zip.file(marker.entry) && types?.includes(marker.type));
    if (!valid) throw ApiError.badRequest(`The ZIP content is not a valid .${format} Office document.`);
    const core = zip.file('docProps/core.xml');
    if (core) {
      try {
        const xml = await core.async('string');
        const title = xml.match(/<(?:dc:)?title[^>]*>([\s\S]*?)<\/(?:dc:)?title>/i)?.[1];
        const subject = xml.match(/<(?:dc:)?subject[^>]*>([\s\S]*?)<\/(?:dc:)?subject>/i)?.[1];
        const decode = (value) => value?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim().slice(0, 2000);
        metadata = { title: decode(title), description: decode(subject) };
      } catch { metadata = null; }
    }
  } else if (['doc', 'ppt', 'xls'].includes(format)) {
    if (!hasCfbSignature) throw ApiError.badRequest(`The file content is not a valid .${format} Office document.`);
    let compound;
    try { compound = CFB.read(buffer, { type: 'buffer' }); }
    catch { throw ApiError.badRequest('The legacy Office document is corrupt.'); }
    const streams = (compound.FullPaths || []).map((entry) => entry.toLowerCase());
    const expected = {
      doc: streams.some((entry) => entry.endsWith('/worddocument')),
      ppt: streams.some((entry) => entry.endsWith('/powerpoint document')),
      xls: streams.some((entry) => entry.endsWith('/workbook') || entry.endsWith('/book')),
    }[format];
    valid = Boolean(expected);
    if (!valid) throw ApiError.badRequest(`The file content does not contain a valid .${format} Office document.`);
  }

  if (!valid) throw ApiError.badRequest('The file content is invalid or unsupported.');
  validateDeclaredMime(format, declaredMime);
  return { format, mimeType: FORMAT_MIME[format], detectedMime: detectedMime || FORMAT_MIME[format], metadata };
}

export default { FORMAT_MIME, inspectDocument };
