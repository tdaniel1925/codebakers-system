---
name: Document AI Specialist
tier: ai
triggers: document, pdf, ocr, extract, parse, scan, pdf generation, template, e-signature, esign, docusign, fill form, invoice, receipt, contract, document processing, pdf extraction, image to text
depends_on: backend.md, database.md
conflicts_with: null
prerequisites: @react-pdf/renderer or puppeteer for PDF gen, tesseract.js or cloud OCR for extraction
description: Document AI — PDF generation from templates, text extraction from PDFs/images, OCR for scanned documents, form filling, e-signature workflows, invoice/receipt parsing, contract analysis
code_templates: pdf-generation.ts
design_tokens: null
---

# Document AI Specialist

## Role

Owns all document processing workflows: generating PDFs from templates and data, extracting text and structured data from uploaded PDFs and images, OCR for scanned/photographed documents, filling PDF forms programmatically, and orchestrating e-signature workflows. Responsible for ensuring generated documents look professional, extracted data is accurate, and document workflows handle errors gracefully (corrupt files, unreadable scans, unsupported formats). Focuses on the processing pipeline — for storing extracted text in a searchable vector database, defers to `rag.md`.

## When to Use

- Generating PDFs from templates (invoices, reports, contracts, proposals, receipts)
- Extracting text or tables from uploaded PDF documents
- OCR on scanned documents or photographed pages
- Parsing invoices, receipts, or structured forms into JSON
- Filling existing PDF forms with dynamic data
- Building e-signature workflows (send → sign → countersign → store)
- Converting HTML or markdown to PDF
- Merging, splitting, or watermarking PDF files
- Extracting data from images (business cards, ID documents, handwritten notes)

## Also Consider

- `rag.md` — for ingesting extracted document text into a searchable knowledge base
- `file-media.md` — for file upload/download handling and storage
- `workflow-automation.md` — for multi-step document workflows (generate → sign → email → archive)
- `email.md` — for sending generated documents as email attachments
- `prompt-engineer.md` — for using AI to analyze or summarize extracted document content

## Anti-Patterns (NEVER Do)

- **Never generate PDFs client-side in production** — always render on the server. Client-side PDF generation is slow, exposes business logic, and produces inconsistent results across browsers
- **Never trust OCR output blindly** — always assign a confidence score and flag low-confidence extractions for human review
- **Never store sensitive documents without encryption** — contracts, IDs, and financial documents must be encrypted at rest. Use Supabase Storage with server-side encryption
- **Never hardcode document templates in code** — store templates in the database or file system so they can be updated without deployment
- **Never skip file validation on upload** — always verify MIME type, file size, and scan for malware before processing. Malicious PDFs are a real attack vector
- **Never generate PDFs with user-supplied HTML without sanitization** — XSS in PDF context can leak server-side data. Sanitize all dynamic content
- **Never block the API while processing large documents** — queue the job, return immediately with a job ID, and notify when complete
- **Never use pixel-based coordinates for form filling** — use PDF form field names or anchored positions. Pixel coordinates break when the PDF layout changes

## Standards & Patterns

### PDF Generation with React-PDF

```typescript
// templates/invoice-template.tsx
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// Register custom fonts for professional look
Font.register({
  family: 'Inter',
  fonts: [
    { src: '/fonts/Inter-Regular.ttf', fontWeight: 'normal' },
    { src: '/fonts/Inter-Bold.ttf', fontWeight: 'bold' },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Inter',
    fontSize: 10,
    color: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  companyName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  invoiceTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  table: {
    marginTop: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    padding: 8,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    padding: 8,
  },
  colDescription: { flex: 3 },
  colQuantity: { flex: 1, textAlign: 'right' },
  colRate: { flex: 1, textAlign: 'right' },
  colAmount: { flex: 1, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 2,
    borderTopColor: '#1a1a1a',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#6b7280',
    textAlign: 'center',
  },
});

interface InvoiceData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  company: { name: string; address: string; email: string };
  client: { name: string; address: string; email: string };
  items: { description: string; quantity: number; rate: number }[];
  notes?: string;
}

export function InvoiceTemplate({ data }: { data: InvoiceData }) {
  const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const tax = subtotal * 0.0825; // 8.25% Texas tax
  const total = subtotal + tax;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{data.company.name}</Text>
            <Text>{data.company.address}</Text>
            <Text>{data.company.email}</Text>
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text>#{data.invoiceNumber}</Text>
            <Text>Date: {data.date}</Text>
            <Text>Due: {data.dueDate}</Text>
          </View>
        </View>

        {/* Bill To */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Bill To:</Text>
          <Text>{data.client.name}</Text>
          <Text>{data.client.address}</Text>
          <Text>{data.client.email}</Text>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Description</Text>
            <Text style={styles.colQuantity}>Qty</Text>
            <Text style={styles.colRate}>Rate</Text>
            <Text style={styles.colAmount}>Amount</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colQuantity}>{item.quantity}</Text>
              <Text style={styles.colRate}>${item.rate.toFixed(2)}</Text>
              <Text style={styles.colAmount}>${(item.quantity * item.rate).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={{ alignItems: 'flex-end', marginTop: 16 }}>
          <View style={{ width: 200 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text>Subtotal:</Text>
              <Text>${subtotal.toFixed(2)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text>Tax (8.25%):</Text>
              <Text>${tax.toFixed(2)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={{ fontWeight: 'bold', fontSize: 14 }}>Total: </Text>
              <Text style={{ fontWeight: 'bold', fontSize: 14 }}>${total.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {data.notes && (
          <View style={{ marginTop: 30 }}>
            <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Notes:</Text>
            <Text style={{ color: '#6b7280' }}>{data.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          Thank you for your business • Payment due within 30 days • {data.company.name}
        </Text>
      </Page>
    </Document>
  );
}
```

### Server-Side PDF Generation API

```typescript
// app/api/documents/generate/route.ts
import { renderToBuffer } from '@react-pdf/renderer';

export async function POST(req: Request) {
  const { templateId, data } = await req.json();

  // 1. Load template
  const Template = await loadTemplate(templateId);
  if (!Template) {
    return Response.json({ error: 'Template not found' }, { status: 404 });
  }

  // 2. Sanitize data (prevent injection)
  const sanitizedData = sanitizeTemplateData(data);

  // 3. Render PDF to buffer
  const buffer = await renderToBuffer(<Template data={sanitizedData} />);

  // 4. Store in Supabase Storage
  const filename = `${templateId}_${Date.now()}.pdf`;
  const { data: uploaded, error } = await supabase.storage
    .from('documents')
    .upload(`generated/${filename}`, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (error) throw error;

  // 5. Create database record
  const { data: doc } = await supabase
    .from('generated_documents')
    .insert({
      template_id: templateId,
      filename,
      storage_path: uploaded.path,
      data_snapshot: sanitizedData, // Store input for regeneration
      status: 'ready',
    })
    .select('id')
    .single();

  // 6. Return download URL
  const { data: urlData } = supabase.storage
    .from('documents')
    .getPublicUrl(uploaded.path);

  return Response.json({
    id: doc?.id,
    url: urlData.publicUrl,
    filename,
  });
}
```

### Text Extraction from PDFs

```typescript
import pdfParse from 'pdf-parse';

interface ExtractionResult {
  text: string;
  pages: number;
  metadata: Record<string, string>;
  confidence: number;
}

async function extractTextFromPDF(fileBuffer: Buffer): Promise<ExtractionResult> {
  try {
    const result = await pdfParse(fileBuffer);

    return {
      text: result.text.trim(),
      pages: result.numpages,
      metadata: {
        title: result.info?.Title || '',
        author: result.info?.Author || '',
        creator: result.info?.Creator || '',
      },
      confidence: result.text.length > 0 ? 0.95 : 0.0,
    };
  } catch (error) {
    // If pdf-parse fails, the PDF might be scanned (image-based)
    // Fall back to OCR
    return extractWithOCR(fileBuffer);
  }
}
```

### OCR for Scanned Documents

```typescript
import Tesseract from 'tesseract.js';

async function extractWithOCR(imageBuffer: Buffer): Promise<ExtractionResult> {
  const worker = await Tesseract.createWorker('eng');

  try {
    const { data } = await worker.recognize(imageBuffer);

    return {
      text: data.text.trim(),
      pages: 1,
      metadata: {},
      confidence: data.confidence / 100, // Tesseract returns 0-100
    };
  } finally {
    await worker.terminate();
  }
}

// For multi-page scanned PDFs: convert each page to image, then OCR
async function ocrScannedPDF(pdfBuffer: Buffer): Promise<ExtractionResult> {
  // Use pdf-to-img or pdf2pic to convert pages to images
  const pages = await convertPDFToImages(pdfBuffer);
  const results: string[] = [];
  let totalConfidence = 0;

  for (const pageImage of pages) {
    const result = await extractWithOCR(pageImage);
    results.push(result.text);
    totalConfidence += result.confidence;
  }

  return {
    text: results.join('\n\n--- Page Break ---\n\n'),
    pages: pages.length,
    metadata: {},
    confidence: totalConfidence / pages.length,
  };
}
```

### AI-Powered Document Parsing

```typescript
// Use Claude to extract structured data from messy document text
async function parseDocumentWithAI(
  extractedText: string,
  documentType: 'invoice' | 'receipt' | 'contract' | 'form'
): Promise<Record<string, unknown>> {
  const schemas: Record<string, string> = {
    invoice: `{
      "vendor_name": "string",
      "invoice_number": "string",
      "date": "YYYY-MM-DD",
      "due_date": "YYYY-MM-DD",
      "line_items": [{ "description": "string", "quantity": "number", "unit_price": "number", "total": "number" }],
      "subtotal": "number",
      "tax": "number",
      "total": "number"
    }`,
    receipt: `{
      "merchant_name": "string",
      "date": "YYYY-MM-DD",
      "items": [{ "name": "string", "price": "number" }],
      "subtotal": "number",
      "tax": "number",
      "total": "number",
      "payment_method": "string"
    }`,
    contract: `{
      "parties": ["string"],
      "effective_date": "YYYY-MM-DD",
      "termination_date": "YYYY-MM-DD or null",
      "key_terms": ["string"],
      "obligations": [{ "party": "string", "obligation": "string" }],
      "governing_law": "string"
    }`,
    form: `{
      "fields": [{ "label": "string", "value": "string", "confidence": "number 0-1" }]
    }`,
  };

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: `You are a document parsing expert. Extract structured data from the provided document text.
Return ONLY valid JSON matching the schema. If a field cannot be determined, use null.
For numbers, extract the numeric value only (no currency symbols).
For dates, use YYYY-MM-DD format.`,
    messages: [
      {
        role: 'user',
        content: `Document type: ${documentType}\nExpected schema: ${schemas[documentType]}\n\nDocument text:\n${extractedText}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}
```

### E-Signature Workflow

```typescript
// Database schema for signature tracking
// CREATE TABLE signature_requests (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   document_id UUID REFERENCES generated_documents(id),
//   signers JSONB NOT NULL, -- [{ email, name, role, order, status, signed_at }]
//   status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'expired', 'cancelled')),
//   expires_at TIMESTAMPTZ,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );

interface Signer {
  email: string;
  name: string;
  role: string; // 'signer' | 'approver' | 'cc'
  order: number; // Signing order (1, 2, 3...)
  status: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined';
  signed_at?: string;
}

async function createSignatureRequest(
  documentId: string,
  signers: Signer[],
  expiresInDays = 30
) {
  const { data, error } = await supabase
    .from('signature_requests')
    .insert({
      document_id: documentId,
      signers: signers.map((s) => ({ ...s, status: 'pending' })),
      status: 'pending',
      expires_at: new Date(Date.now() + expiresInDays * 86400000).toISOString(),
    })
    .select('id')
    .single();

  if (error) throw error;

  // Send to first signer (sequential signing)
  const firstSigner = signers.sort((a, b) => a.order - b.order)[0];
  await sendSignatureEmail(data.id, firstSigner, documentId);

  return data.id;
}

async function sendSignatureEmail(requestId: string, signer: Signer, documentId: string) {
  const signUrl = `${process.env.NEXT_PUBLIC_APP_URL}/sign/${requestId}?email=${encodeURIComponent(signer.email)}`;

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: signer.email,
    subject: `Signature requested: Please review and sign`,
    html: renderSignatureEmailTemplate({
      signerName: signer.name,
      signUrl,
      expiresAt: '30 days',
    }),
  });

  // Update signer status
  await updateSignerStatus(requestId, signer.email, 'sent');
}
```

### Document Processing Queue

```typescript
// For large documents, process asynchronously
async function queueDocumentProcessing(
  fileId: string,
  operation: 'extract' | 'ocr' | 'parse' | 'generate'
) {
  const { data: job } = await supabase
    .from('document_jobs')
    .insert({
      file_id: fileId,
      operation,
      status: 'queued',
    })
    .select('id')
    .single();

  // Trigger processing via Edge Function or background job
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-document`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jobId: job?.id }),
  });

  return job?.id;
}
```

## Code Templates

- `pdf-generation.ts` — Server-side PDF generation with React-PDF templates, Supabase Storage upload, and download URL generation

## Checklist

- [ ] PDF generation runs server-side only (never client-side in production)
- [ ] All uploaded files validated: MIME type, file size limit, content scanning
- [ ] Dynamic content sanitized before template injection
- [ ] OCR results include confidence scores; low-confidence flagged for review
- [ ] Templates stored externally (database or storage), not hardcoded
- [ ] Generated PDFs stored in Supabase Storage with access controls
- [ ] Processing queue for large documents (don't block API routes)
- [ ] E-signature workflow tracks status per signer with audit trail
- [ ] Extracted data validated against expected schema
- [ ] Error handling for corrupt/unreadable files with user-friendly messages
- [ ] Document retention policies enforced (auto-delete after expiry)
- [ ] PDF/A format used when long-term archival is required
- [ ] Fonts embedded in generated PDFs (don't rely on system fonts)
- [ ] Watermark support for draft/preview documents
- [ ] Audit log for all document operations (who generated/viewed/signed what)

## Common Pitfalls

1. **Missing fonts in generated PDFs** — If you don't register and embed fonts, React-PDF falls back to Helvetica, which doesn't support many characters. Always register custom fonts with all weight variants.

2. **OCR on high-res images is slow** — A 4000x6000 photo takes 10+ seconds to OCR. Resize to 2000px max width before OCR — quality is nearly identical but processing is 3-4x faster.

3. **PDF text extraction returns garbage** — Some PDFs use custom encoding or embedded fonts that pdf-parse can't decode. Always have OCR as a fallback path for text extraction.

4. **Client-side PDF generation memory issues** — Generating a 50-page PDF in the browser can crash mobile devices. Server-side generation with streaming download is the only reliable approach for anything over a few pages.

5. **E-signature legal compliance** — A simple "I agree" checkbox is not a legally binding e-signature in all jurisdictions. Research ESIGN Act (US) and eIDAS (EU) requirements. Consider using DocuSign or HelloSign APIs for legally compliant signatures rather than building your own.

6. **Sensitive data in generated PDFs** — Generated invoices, contracts, and reports often contain PII. Set proper access controls on Supabase Storage, use signed URLs with expiration for downloads, and never make document buckets public.
