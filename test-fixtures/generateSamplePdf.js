import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

async function createSampleDocuments() {
  const outDir = path.resolve(process.cwd(), 'test-fixtures');
  await fs.mkdir(outDir, { recursive: true });

  // 1. Create Sample Job Description PDF
  const doc1 = await PDFDocument.create();
  const fontBold = await doc1.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc1.embedFont(StandardFonts.Helvetica);

  // Page 1: Role Overview & Responsibilities
  const page1 = doc1.addPage([600, 800]);
  page1.drawText('UNTHINKABLE - SENIOR FULL-STACK SOFTWARE ENGINEER', {
    x: 50,
    y: 740,
    size: 16,
    font: fontBold,
    color: rgb(0.05, 0.05, 0.05),
  });

  page1.drawText('Section 01: Role Overview & Responsibilities', {
    x: 50,
    y: 705,
    size: 12,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });

  const page1Body = [
    'We are hiring an exceptional Full-Stack Engineer to architect our multimodal intelligence platform.',
    'You will design distributed document processing pipelines, OCR extraction routines, and vector retrieval systems.',
    'Key Responsibilities:',
    '- Design resilient backend architectures with Node.js, Express, TypeScript, and MongoDB.',
    '- Build intuitive, continuous document viewers in React with sub-50ms citation jumps.',
    '- Maintain 99.9% uptime across our microservices handling 50,000 active daily queries.',
    '- Collaborate with AI researchers on hybrid extractive and generative summarization pipelines.',
  ];

  let y = 670;
  for (const line of page1Body) {
    page1.drawText(line, { x: 50, y, size: 10, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
    y -= 22;
  }

  // Page 2: Selection Process & Compensation Details
  const page2 = doc1.addPage([600, 800]);
  page2.drawText('Section 02: Compensation, Duration & Selection Process', {
    x: 50,
    y: 740,
    size: 14,
    font: fontBold,
    color: rgb(0.05, 0.05, 0.05),
  });

  const page2Body = [
    'Compensation & Benefits Overview:',
    'Total annual compensation for this role is ₹3,00,000 with additional equity incentives.',
    'The initial evaluation begins with a mandatory 6 months internship starting August 2026.',
    'Our engineering team currently includes 120 employees operating globally.',
    'We achieved a 30% performance gain in document extraction throughput this year.',
    '',
    'Selection Process Stages:',
    'Stage 1: System Architecture Assessment (Zero-failure design under heavy load)',
    'Stage 2: Technical Deep Dive & Code Review (Production TypeScript implementation)',
    'Stage 3: Product Engineering Culture Interview',
  ];

  y = 700;
  for (const line of page2Body) {
    page2.drawText(line, { x: 50, y, size: 10, font: line.startsWith('Section') ? fontBold : fontRegular, color: rgb(0.1, 0.1, 0.1) });
    y -= 22;
  }

  const pdfBytes1 = await doc1.save();
  await fs.writeFile(path.join(outDir, 'sample-job-description.pdf'), pdfBytes1);
  console.log('Created sample-job-description.pdf');
}

createSampleDocuments().catch(console.error);
