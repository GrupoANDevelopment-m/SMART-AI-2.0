import { createRequire } from "module";
import fs from "fs";
const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');
const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : (pdfParseModule.default || pdfParseModule.PDFParse);

// write a dummy PDF file
const dummyPdf = Buffer.from(
  "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000109 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n163\n%%EOF\n"
);

async function test() {
  try {
    const res = await pdfParse(dummyPdf);
    console.log("Success text length:", res.text.length);
  } catch(e) {
    console.log("Error:", e);
  }
}
test();
