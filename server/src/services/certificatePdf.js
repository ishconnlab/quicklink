import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

const TEMPLATE_PATH = fileURLToPath(new URL('../../assets/certificates/IshConnect_Certificate_of_Completion.pdf', import.meta.url));
const STAMP_PATH = fileURLToPath(new URL('../../assets/certificates/SHCONNECT_Corporate_Seal-removeb.png', import.meta.url));
const REGULAR_FONT_PATH = fileURLToPath(new URL('../../assets/certificates/NotoSans-Regular.ttf', import.meta.url));
const BOLD_FONT_PATH = fileURLToPath(new URL('../../assets/certificates/NotoSans-Bold.ttf', import.meta.url));
const BRAND_COLOR = rgb(0.05, 0.13, 0.31);
const ACCENT_COLOR = rgb(0.91, 0.31, 0.08);

export async function createCertificatePdf(certificate, verificationUrl) {
  const [template, stampBytes, regularFontBytes, boldFontBytes, qrBytes] = await Promise.all([
    fs.readFile(TEMPLATE_PATH),
    fs.readFile(STAMP_PATH),
    fs.readFile(REGULAR_FONT_PATH),
    fs.readFile(BOLD_FONT_PATH),
    QRCode.toBuffer(verificationUrl, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 256 }),
  ]);
  const document = await PDFDocument.load(template);
  document.registerFontkit(fontkit);
  const page = document.getPages()[0];
  const regular = await document.embedFont(regularFontBytes, { subset: false });
  const bold = await document.embedFont(boldFontBytes, { subset: false });
  const stamp = await document.embedPng(stampBytes);
  const qr = await document.embedPng(qrBytes);
  const { width, height } = page.getSize();
  const drawCentered = (text, y, font, size, color, maxWidth = width - 120) => {
    let fittedSize = size;
    while (fittedSize > 8 && font.widthOfTextAtSize(text, fittedSize) > maxWidth) fittedSize -= 0.5;
    const textWidth = font.widthOfTextAtSize(text, fittedSize);
    page.drawText(text, { x: (width - textWidth) / 2, y, size: fittedSize, font, color });
  };

  drawCentered(certificate.studentName, height - 292, bold, 26, BRAND_COLOR, width - 200);
  drawCentered('has successfully completed', height - 350, regular, 12, BRAND_COLOR);
  drawCentered(certificate.courseTitle, height - 383, bold, 20, ACCENT_COLOR, width - 200);
  drawCentered(`${certificate.level}  ·  Issued ${new Date(certificate.issuedAt).toLocaleDateString('en-GB')}`, height - 407, regular, 11, BRAND_COLOR);
  drawCentered('IshConnect · QuickLink Learning Portal', height - 427, regular, 10, BRAND_COLOR);

  const stampWidth = 76;
  const stampHeight = stamp.height * stampWidth / stamp.width;
  const stampX = 380;
  const stampY = 100;
  const qrSize = 58;
  const qrX = stampX + stampWidth + 14;
  const qrY = stampY + (stampHeight - qrSize) / 2;
  page.drawImage(stamp, { x: stampX, y: stampY, width: stampWidth, height: stampHeight });
  page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  const verifyLabel = 'Scan to verify';
  page.drawText(verifyLabel, {
    x: qrX + (qrSize - regular.widthOfTextAtSize(verifyLabel, 7)) / 2,
    y: qrY - 9,
    size: 7,
    font: regular,
    color: BRAND_COLOR,
  });
  page.drawText(`Certificate ID: ${certificate.code}`, { x: 350, y: 22, size: 7.5, font: regular, color: BRAND_COLOR });

  return Buffer.from(await document.save());
}

export default createCertificatePdf;
