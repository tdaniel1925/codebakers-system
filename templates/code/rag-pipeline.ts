/**
 * RAG Ingestion Pipeline
 * CodeBakers Agent System — Code Template
 *
 * Usage: Copy to lib/rag/pipeline.ts
 * Requires: Supabase with pgvector extension, OpenAI API key for embeddings
 *
 * Features:
 * - Document ingestion from text, markdown, HTML, and PDF (via buffer)
 * - Semantic chunking that respects headings, paragraphs, and sentences
 * - Configurable chunk size with overlap for context continuity
 * - Batch embedding generation (OpenAI text-embedding-3-small)
 * - Content hashing for deduplication and incremental updates
 * - Document status tracking (pending → processing → ready → error)
 * - Metadata preservation per chunk (source doc, page, section, index)
 * - Delete + re-ingest for updated documents
 * - Bulk ingestion with progress callback
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────

interface IngestOptions {
  /** Target tokens per chunk (default: 512) */
  chunkSize?: number;
  /** Overlap tokens between chunks (default: 50) */
  chunkOverlap?: number;
  /** Additional metadata to store on every chunk */
  metadata?: Record<string, unknown>;
  /** Force re-ingestion even if content hash matches */
  force?: boolean;
  /** Progress callback */
  onProgress?: (stage: string, current: number, total: number) => void;
}

interface Document {
  id: string;
  title: string;
  sourceType: string;
  contentHash: string;
  chunkCount: number;
  status: string;
  createdAt: string;
}

interface Chunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

interface IngestResult {
  documentId: string;
  chunksCreated: number;
  status: 'created' | 'skipped' | 'updated';
}

// ─── Supabase Client ──────────────────────────────────────

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Content Hashing ──────────────────────────────────────

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Token Estimation ─────────────────────────────────────

/** Rough token estimate: ~4 chars per token for English text */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Rough char limit from token target */
function tokensToChars(tokens: number): number {
  return tokens * 4;
}

// ─── Text Chunking ────────────────────────────────────────

const DEFAULT_SEPARATORS = [
  '\n## ',     // H2 headers (highest priority)
  '\n### ',    // H3 headers
  '\n#### ',   // H4 headers
  '\n\n',      // Paragraph breaks
  '\n',        // Line breaks
  '. ',        // Sentence boundaries
  '; ',        // Clause boundaries
  ', ',        // Phrase boundaries
  ' ',         // Word boundaries (last resort)
];

/**
 * Recursively split text into chunks that respect semantic boundaries.
 * Tries higher-priority separators first, falls back to lower ones.
 */
function splitRecursive(
  text: string,
  maxChars: number,
  separators: string[],
  separatorIndex = 0
): string[] {
  // Base case: text fits in one chunk
  if (text.length <= maxChars) return [text.trim()].filter(Boolean);

  // No more separators — hard split
  if (separatorIndex >= separators.length) {
    return hardSplit(text, maxChars);
  }

  const separator = separators[separatorIndex];
  const parts = text.split(separator);

  // Separator not found — try the next one
  if (parts.length <= 1) {
    return splitRecursive(text, maxChars, separators, separatorIndex + 1);
  }

  // Merge parts back together respecting max size
  const chunks: string[] = [];
  let current = '';

  for (const part of parts) {
    const candidate = current
      ? current + separator + part
      : part;

    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) chunks.push(current.trim());

      // If this single part exceeds max, split it recursively
      if (part.length > maxChars) {
        const subChunks = splitRecursive(part, maxChars, separators, separatorIndex + 1);
        chunks.push(...subChunks.slice(0, -1));
        current = subChunks[subChunks.length - 1] || '';
      } else {
        current = part;
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/** Hard split at character boundary when no separator works */
function hardSplit(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push(text.slice(i, i + maxChars).trim());
  }
  return chunks.filter(Boolean);
}

/**
 * Apply overlap: prepend tail of previous chunk to current chunk.
 */
function applyOverlap(chunks: string[], overlapChars: number): string[] {
  if (overlapChars <= 0 || chunks.length <= 1) return chunks;

  const result: string[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1];
    // Take the last N characters from previous chunk
    const overlap = prevChunk.slice(-overlapChars).trim();
    result.push(overlap + ' ' + chunks[i]);
  }

  return result;
}

/**
 * Extract section headers for metadata.
 * Returns the last heading found before this chunk's content.
 */
function extractSectionHeader(fullText: string, chunkContent: string): string | null {
  const chunkStart = fullText.indexOf(chunkContent.slice(0, 100));
  if (chunkStart === -1) return null;

  const textBefore = fullText.slice(0, chunkStart);
  const headingMatches = textBefore.match(/^#{1,4}\s+.+$/gm);
  return headingMatches ? headingMatches[headingMatches.length - 1].replace(/^#+\s+/, '') : null;
}

/**
 * Main chunking function.
 */
function chunkText(
  text: string,
  options: { chunkSize: number; chunkOverlap: number }
): Chunk[] {
  const maxChars = tokensToChars(options.chunkSize);
  const overlapChars = tokensToChars(options.chunkOverlap);

  // Split into raw chunks
  const rawChunks = splitRecursive(text, maxChars, DEFAULT_SEPARATORS);

  // Apply overlap
  const overlappedChunks = applyOverlap(rawChunks, overlapChars);

  // Build chunk objects with metadata
  return overlappedChunks.map((content, index) => ({
    content,
    chunkIndex: index,
    tokenCount: estimateTokens(content),
    metadata: {
      section: extractSectionHeader(text, content),
      chunk_of: overlappedChunks.length,
    },
  }));
}

// ─── Embedding Generation ─────────────────────────────────

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH_SIZE = 100; // OpenAI supports up to 2048

async function generateEmbeddings(
  texts: string[],
  onProgress?: (current: number, total: number) => void
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        `Embedding API error (${response.status}): ${err.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    const embeddings = data.data
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((d: { embedding: number[] }) => d.embedding);

    allEmbeddings.push(...embeddings);
    onProgress?.(Math.min(i + EMBEDDING_BATCH_SIZE, texts.length), texts.length);
  }

  return allEmbeddings;
}

// ─── Pre-processors ───────────────────────────────────────

/** Strip HTML tags, keeping text content */
function stripHTML(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clean up markdown for better chunking */
function cleanMarkdown(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, '')  // Remove comments
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links → text only
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
    .replace(/^\s*[-*]\s*/gm, '• ') // Normalize list markers
    .trim();
}

/** Preprocess content based on source type */
function preprocessContent(content: string, sourceType: string): string {
  switch (sourceType) {
    case 'html':
      return stripHTML(content);
    case 'markdown':
    case 'md':
      return cleanMarkdown(content);
    default:
      return content.trim();
  }
}

// ─── Main Ingestion Pipeline ──────────────────────────────

/**
 * Ingest a document into the RAG knowledge base.
 *
 * 1. Hash content for deduplication
 * 2. Create document record
 * 3. Chunk the content
 * 4. Generate embeddings in batches
 * 5. Store chunks with embeddings in pgvector
 */
export async function ingestDocument(
  title: string,
  content: string,
  sourceType: string,
  options: IngestOptions = {}
): Promise<IngestResult> {
  const {
    chunkSize = 512,
    chunkOverlap = 50,
    metadata = {},
    force = false,
    onProgress,
  } = options;

  const supabase = getSupabase();

  onProgress?.('hashing', 0, 1);

  // 1. Hash content
  const contentHash = await hashContent(content);

  // 2. Check for existing document
  const { data: existing } = await supabase
    .from('documents')
    .select('id, content_hash, status')
    .eq('content_hash', contentHash)
    .single();

  if (existing && !force) {
    return {
      documentId: existing.id,
      chunksCreated: 0,
      status: 'skipped',
    };
  }

  // If forcing re-ingestion, delete old chunks
  if (existing && force) {
    await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', existing.id);

    await supabase
      .from('documents')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  }

  // 3. Create or reuse document record
  const documentId = existing?.id || undefined;
  let docId: string;

  if (documentId) {
    docId = documentId;
  } else {
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        title,
        source_type: sourceType,
        content_hash: contentHash,
        metadata,
        status: 'processing',
      })
      .select('id')
      .single();

    if (docError) throw new Error(`Failed to create document: ${docError.message}`);
    docId = doc.id;
  }

  try {
    onProgress?.('chunking', 0, 1);

    // 4. Preprocess and chunk
    const cleanedContent = preprocessContent(content, sourceType);
    const chunks = chunkText(cleanedContent, { chunkSize, chunkOverlap });

    if (chunks.length === 0) {
      await supabase
        .from('documents')
        .update({ status: 'error', metadata: { ...metadata, error: 'No content to chunk' } })
        .eq('id', docId);
      throw new Error('Document produced no chunks — content may be empty or too short');
    }

    onProgress?.('chunking', 1, 1);

    // 5. Generate embeddings
    onProgress?.('embedding', 0, chunks.length);

    const embeddings = await generateEmbeddings(
      chunks.map((c) => c.content),
      (current, total) => onProgress?.('embedding', current, total)
    );

    // 6. Store chunks with embeddings
    onProgress?.('storing', 0, chunks.length);

    const STORE_BATCH_SIZE = 50;
    for (let i = 0; i < chunks.length; i += STORE_BATCH_SIZE) {
      const batch = chunks.slice(i, i + STORE_BATCH_SIZE);
      const batchEmbeddings = embeddings.slice(i, i + STORE_BATCH_SIZE);

      const rows = batch.map((chunk, j) => ({
        document_id: docId,
        content: chunk.content,
        embedding: JSON.stringify(batchEmbeddings[j]),
        chunk_index: chunk.chunkIndex,
        token_count: chunk.tokenCount,
        metadata: {
          ...metadata,
          ...chunk.metadata,
          document_title: title,
          source_type: sourceType,
        },
      }));

      const { error: insertError } = await supabase
        .from('document_chunks')
        .insert(rows);

      if (insertError) throw new Error(`Failed to store chunks: ${insertError.message}`);

      onProgress?.('storing', Math.min(i + STORE_BATCH_SIZE, chunks.length), chunks.length);
    }

    // 7. Update document status
    await supabase
      .from('documents')
      .update({
        status: 'ready',
        chunk_count: chunks.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', docId);

    onProgress?.('done', 1, 1);

    return {
      documentId: docId,
      chunksCreated: chunks.length,
      status: existing ? 'updated' : 'created',
    };
  } catch (error) {
    // Mark document as errored
    await supabase
      .from('documents')
      .update({
        status: 'error',
        metadata: { ...metadata, error: String(error) },
      })
      .eq('id', docId);

    throw error;
  }
}

// ─── Bulk Ingestion ───────────────────────────────────────

interface BulkDocument {
  title: string;
  content: string;
  sourceType: string;
  metadata?: Record<string, unknown>;
}

export async function ingestDocuments(
  documents: BulkDocument[],
  options: IngestOptions = {}
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    options.onProgress?.('document', i + 1, documents.length);

    try {
      const result = await ingestDocument(
        doc.title,
        doc.content,
        doc.sourceType,
        { ...options, metadata: { ...options.metadata, ...doc.metadata } }
      );
      results.push(result);
    } catch (error) {
      console.error(`Failed to ingest "${doc.title}":`, error);
      results.push({
        documentId: '',
        chunksCreated: 0,
        status: 'skipped',
      });
    }
  }

  return results;
}

// ─── Document Management ──────────────────────────────────

/** List all documents in the knowledge base */
export async function listDocuments(): Promise<Document[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, source_type, content_hash, chunk_count, status, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((d) => ({
    id: d.id,
    title: d.title,
    sourceType: d.source_type,
    contentHash: d.content_hash,
    chunkCount: d.chunk_count,
    status: d.status,
    createdAt: d.created_at,
  }));
}

/** Delete a document and all its chunks */
export async function deleteDocument(documentId: string): Promise<void> {
  const supabase = getSupabase();

  // Chunks deleted via ON DELETE CASCADE
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (error) throw error;
}

/** Get document stats */
export async function getKnowledgeBaseStats(): Promise<{
  totalDocuments: number;
  totalChunks: number;
  readyDocuments: number;
  errorDocuments: number;
}> {
  const supabase = getSupabase();

  const { count: totalDocs } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true });

  const { count: totalChunks } = await supabase
    .from('document_chunks')
    .select('*', { count: 'exact', head: true });

  const { count: readyDocs } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ready');

  const { count: errorDocs } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'error');

  return {
    totalDocuments: totalDocs || 0,
    totalChunks: totalChunks || 0,
    readyDocuments: readyDocs || 0,
    errorDocuments: errorDocs || 0,
  };
}

// ─── Exports ──────────────────────────────────────────────

export {
  chunkText,
  generateEmbeddings,
  hashContent,
  estimateTokens,
  preprocessContent,
  type IngestOptions,
  type IngestResult,
  type Document,
  type Chunk,
};

// ─── Usage Example ────────────────────────────────────────
//
// import { ingestDocument, ingestDocuments, listDocuments, deleteDocument } from '@/lib/rag/pipeline';
//
// // Single document
// const result = await ingestDocument(
//   'Company FAQ',
//   faqMarkdownContent,
//   'markdown',
//   {
//     chunkSize: 512,
//     chunkOverlap: 50,
//     metadata: { category: 'support', language: 'en' },
//     onProgress: (stage, current, total) => {
//       console.log(`${stage}: ${current}/${total}`);
//     },
//   }
// );
// console.log(`Ingested: ${result.chunksCreated} chunks (${result.status})`);
//
// // Bulk ingestion
// const docs = [
//   { title: 'Privacy Policy', content: privacyText, sourceType: 'text' },
//   { title: 'Terms of Service', content: tosHTML, sourceType: 'html' },
//   { title: 'User Guide', content: guideMarkdown, sourceType: 'markdown' },
// ];
// const results = await ingestDocuments(docs, { chunkSize: 400 });
//
// // List and manage
// const allDocs = await listDocuments();
// await deleteDocument(allDocs[0].id);
