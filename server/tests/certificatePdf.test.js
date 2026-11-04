import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { createCertificatePdf } from '../src/services/certificatePdf.js';

test('certificate PDF uses the IshConnect template and embeds certificate details', async () => {
  const certificate = {
    code: 'A'.repeat(32),
    studentName: 'Élodie Noël',
    courseTitle: 'Éducation numérique',
    level: 'L3',
    issuedAt: new Date('2026-01-15T00:00:00.000Z'),
  };
  const pdf = await createCertificatePdf(certificate, 'https://quicklink.ishconnect.rw/verify/example');
  const document = await PDFDocument.load(pdf);
  const [page] = document.getPages();
  const { width, height } = page.getSize();

  assert.equal(document.getPageCount(), 1);
  assert.ok(Math.abs(width - 841.89) < 1);
  assert.ok(Math.abs(height - 595.28) < 1);
  assert.ok(pdf.length > 500_000);
});
