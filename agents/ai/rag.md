---
name: RAG & Knowledge Retrieval Specialist
tier: ai
triggers: rag, retrieval, embeddings, vector, pgvector, knowledge base, semantic search, chunking, citations, document search, context retrieval, embedding, similarity, vector store, vector database
depends_on: database.md, backend.md
conflicts_with: null
prerequisites: pgvector extension enabled in Supabase, Anthropic or OpenAI API key for embeddings
description: RAG pipelines — document ingestion, text chunking, embedding generation, pgvector storage, semantic retrieval, citation tracking, hybrid search (vector + full-text)
code_templates: rag-pipeline.ts, pgvector-search.ts
design_tokens: null
---

# RAG & Knowledge Retrieval Specialist

## Role

Owns the full Retrieval-Augmented Generation pipeline: ingesting documents, splitting them into semantically meaningful chunks, generating embeddings, storing vectors in pgvector, retrieving relevant context at query time, and injecting that context into LLM prompts with proper citations. Ensures retrieval quality through chunk overlap, metadata filtering, hybrid search (vector + keyword), and re-ranking. Responsible for keeping the knowledge base fresh with incremental updates and deduplication.

## When to Use

- Building a "chat with your documents" feature
- Adding a knowledge base to a chatbot or support system
- Implementing semantic search over internal docs, help articles, or legal filings
- Ingesting PDFs, markdown, HTML, or plain text into a searchable vector store
- Building citation-backed AI responses ("According to Section 3.2…")
- Setting up pgvector in Supabase for similarity search
- Optimizing retrieval quality (chunk size, overlap, re-ranking)
- Implementing hybrid search combining vector similarity with full-text keyword matching

## Also Consider

- `chatbot.md` — for the conversational UI that consumes retrieved context
- `prompt-engineer.md` — for crafting prompts that use retrieved context effectively
- `document-ai.md` — for extracting text from PDFs, images, or scanned documents before ingestion
- `database.md` — for pgvector setup, indexing strategy, and query optimization
- `search.md` — for user-facing search UI with filters and facets

## Anti-Patterns (NEVER Do)

- **Never chunk by fixed character count alone** — always respect semantic boundaries (paragraphs, sections, headers). A chunk that splits mid-sentence produces garbage retrieval
- **Never skip overlap between chunks** — without 10-20% overlap, context at chunk boundaries is lost and retrieval quality drops significantly
- **Never embed entire documents as single vectors** — large documents lose specificity. A 50-page PDF as one vector matches everything poorly
- **Never use cosine similarity without a relevance threshold** — always filter results below a minimum similarity score (typically 0.7+). Low-similarity results add noise to the LLM context
- **Never skip metadata on chunks** — always store source document, page number, section title, and chunk index. Without metadata, citations are impossible
- **Never regenerate all embeddings on every update** — implement incremental ingestion with content hashing to detect changes. Re-embed only what changed
- **Never use raw vector search alone for production** — always combine with keyword/full-text search (hybrid) for better recall, especially for proper nouns and exact phrases that embeddings handle poorly
- **Never stuff all retrieved chunks into one prompt** — rank by relevance and use only the top-k most relevant chunks. More context ≠ better answers

## Standards & Patterns

### pgvector Setup in Supabase

```sql
-- Enable the extension (run once)
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table (source tracking)
CREATE TABLE documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT CHECK (source_type IN ('pdf', 'markdown', 'html', 'text', 'url')),
  source_url TEXT,
  file_path TEXT,
  content_hash TEXT UNIQUE, -- For dedup and change detection
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chunks table with vectors
CREATE TABLE document_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536), -- OpenAI ada-002 / text-embedding-3-small dimension
  chunk_index INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}', -- page, section, headers, etc.
  token_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast similarity search (better than ivfflat for < 1M rows)
CREATE INDEX idx_chunks_embedding ON document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search index for hybrid queries
ALTER TABLE document_chunks ADD COLUMN fts TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX idx_chunks_fts ON document_chunks USING gin (fts);

-- Composite index for filtered vector search
CREATE INDEX idx_chunks_document ON document_chunks (document_id);

-- RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
```

### Chunking Strategy

```typescript
interface ChunkOptions {
  maxTokens: number;      // Target chunk size (default: 512)
  overlapTokens: number;  // Overlap between chunks (default: 50)
  separators: string[];   // Split priority order
}

const DEFAULT_OPTIONS: ChunkOptions = {
  maxTokens: 512,
  overlapTokens: 50,
  separators: [
    '\n## ',     // H2 headers (highest priority split)
    '\n### ',    // H3 headers
    '\n\n',      // Double newline (paragraph break)
    '\n',        // Single newline
    '. ',        // Sentence boundary
    ' ',         // Word boundary (last resort)
  ],
};

function chunkDocument(text: string, options = DEFAULT_OPTIONS): string[] {
  const chunks: string[] = [];

  function splitRecursive(text: string, separatorIndex: number): string[] {
    if (estimateTokens(text) <= options.maxTokens) return [text];
    if (separatorIndex >= options.separators.length) {
      // Hard split at token limit
      return hardSplitByTokens(text, options.maxTokens);
    }

    const sep = options.separators[separatorIndex];
    const parts = text.split(sep);

    if (parts.length === 1) {
      // Separator not found, try next one
      return splitRecursive(text, separatorIndex + 1);
    }

    const result: string[] = [];
    let current = '';

    for (const part of parts) {
      const candidate = current ? current + sep + part : part;
      if (estimateTokens(candidate) <= options.maxTokens) {
        current = candidate;
      } else {
        if (current) result.push(current);
        current = part;
      }
    }
    if (current) result.push(current);

    // Recursively split any still-too-large chunks
    return result.flatMap((chunk) =>
      estimateTokens(chunk) > options.maxTokens
        ? splitRecursive(chunk, separatorIndex + 1)
        : [chunk]
    );
  }

  const rawChunks = splitRecursive(text, 0);

  // Add overlap
  for (let i = 0; i < rawChunks.length; i++) {
    if (i > 0 && options.overlapTokens > 0) {
      const prevWords = rawChunks[i - 1].split(' ');
      const overlapWords = prevWords.slice(-options.overlapTokens);
      chunks.push(overlapWords.join(' ') + ' ' + rawChunks[i]);
    } else {
      chunks.push(rawChunks[i]);
    }
  }

  return chunks.map((c) => c.trim()).filter(Boolean);
}

function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters for English
  return Math.ceil(text.length / 4);
}
```

### Embedding Generation

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // Batch embed — OpenAI supports up to 2048 inputs per call
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: batch,
      }),
    });

    if (!response.ok) throw new Error(`Embedding API error: ${response.statusText}`);

    const data = await response.json();
    allEmbeddings.push(...data.data.map((d: { embedding: number[] }) => d.embedding));
  }

  return allEmbeddings;
}
```

### Full Ingestion Pipeline

```typescript
async function ingestDocument(
  title: string,
  content: string,
  sourceType: string,
  metadata: Record<string, unknown> = {}
) {
  const contentHash = await hashContent(content);

  // 1. Check for duplicates
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('content_hash', contentHash)
    .single();

  if (existing) {
    console.log('Document already ingested, skipping');
    return existing.id;
  }

  // 2. Create document record
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({ title, source_type: sourceType, content_hash: contentHash, metadata, status: 'processing' })
    .select('id')
    .single();

  if (docError) throw docError;

  try {
    // 3. Chunk the content
    const chunks = chunkDocument(content);

    // 4. Generate embeddings for all chunks
    const embeddings = await generateEmbeddings(chunks);

    // 5. Store chunks with embeddings
    const chunkRows = chunks.map((chunk, index) => ({
      document_id: doc.id,
      content: chunk,
      embedding: JSON.stringify(embeddings[index]),
      chunk_index: index,
      token_count: estimateTokens(chunk),
      metadata: { ...metadata, chunk_of: chunks.length },
    }));

    const { error: chunkError } = await supabase
      .from('document_chunks')
      .insert(chunkRows);

    if (chunkError) throw chunkError;

    // 6. Update document status
    await supabase
      .from('documents')
      .update({ status: 'ready', chunk_count: chunks.length })
      .eq('id', doc.id);

    return doc.id;
  } catch (error) {
    await supabase
      .from('documents')
      .update({ status: 'error', metadata: { ...metadata, error: String(error) } })
      .eq('id', doc.id);
    throw error;
  }
}

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### Hybrid Search (Vector + Full-Text)

```sql
-- Supabase RPC function for hybrid search
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding VECTOR(1536),
  query_text TEXT,
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7,
  filter_document_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT,
  text_rank FLOAT,
  combined_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT
      dc.id,
      dc.document_id,
      dc.content,
      dc.metadata,
      1 - (dc.embedding <=> query_embedding) AS similarity,
      0::FLOAT AS text_rank
    FROM document_chunks dc
    WHERE 1 - (dc.embedding <=> query_embedding) > similarity_threshold
      AND (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  text_results AS (
    SELECT
      dc.id,
      dc.document_id,
      dc.content,
      dc.metadata,
      0::FLOAT AS similarity,
      ts_rank(dc.fts, websearch_to_tsquery('english', query_text)) AS text_rank
    FROM document_chunks dc
    WHERE dc.fts @@ websearch_to_tsquery('english', query_text)
      AND (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
    ORDER BY text_rank DESC
    LIMIT match_count * 2
  ),
  combined AS (
    SELECT
      COALESCE(v.id, t.id) AS id,
      COALESCE(v.document_id, t.document_id) AS document_id,
      COALESCE(v.content, t.content) AS content,
      COALESCE(v.metadata, t.metadata) AS metadata,
      COALESCE(v.similarity, 0) AS similarity,
      COALESCE(t.text_rank, 0) AS text_rank,
      -- Weighted combination: 70% vector, 30% keyword
      (COALESCE(v.similarity, 0) * 0.7 + COALESCE(t.text_rank, 0) * 0.3) AS combined_score
    FROM vector_results v
    FULL OUTER JOIN text_results t ON v.id = t.id
  )
  SELECT * FROM combined
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;
```

### Retrieval + Prompt Injection

```typescript
async function queryWithRAG(
  userQuestion: string,
  options: { topK?: number; documentIds?: string[] } = {}
): Promise<{ answer: string; sources: Source[] }> {
  const { topK = 5, documentIds } = options;

  // 1. Embed the question
  const [queryEmbedding] = await generateEmbeddings([userQuestion]);

  // 2. Hybrid search
  const { data: chunks, error } = await supabase.rpc('hybrid_search', {
    query_embedding: JSON.stringify(queryEmbedding),
    query_text: userQuestion,
    match_count: topK,
    similarity_threshold: 0.7,
    filter_document_ids: documentIds || null,
  });

  if (error) throw error;
  if (!chunks || chunks.length === 0) {
    return { answer: "I couldn't find relevant information to answer that question.", sources: [] };
  }

  // 3. Build context block with source labels
  const contextBlock = chunks
    .map((chunk: any, i: number) => `[Source ${i + 1}]\n${chunk.content}`)
    .join('\n\n---\n\n');

  // 4. Generate answer with citations
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `You are a helpful assistant. Answer the user's question based ONLY on the provided sources.
Rules:
- Cite sources using [Source N] notation
- If the sources don't contain the answer, say so honestly
- Never make up information not in the sources
- Be concise and direct`,
    messages: [
      {
        role: 'user',
        content: `Sources:\n${contextBlock}\n\nQuestion: ${userQuestion}`,
      },
    ],
  });

  const answer = response.content[0].type === 'text' ? response.content[0].text : '';

  // 5. Extract cited sources
  const sources = chunks.map((chunk: any, i: number) => ({
    index: i + 1,
    documentId: chunk.document_id,
    content: chunk.content.slice(0, 200) + '…',
    similarity: chunk.similarity,
    metadata: chunk.metadata,
  }));

  return { answer, sources };
}
```

## Code Templates

- `rag-pipeline.ts` — Complete ingestion pipeline: chunking, embedding, storage, incremental updates
- `pgvector-search.ts` — Hybrid search RPC function caller with re-ranking and citation extraction

## Checklist

- [ ] pgvector extension enabled in Supabase
- [ ] HNSW index created on embedding column (not just ivfflat)
- [ ] Chunking respects semantic boundaries (paragraphs, headers) not fixed character counts
- [ ] Chunk overlap configured (10-20% of chunk size)
- [ ] Metadata stored on every chunk (source doc, page, section, chunk index)
- [ ] Content hash stored for deduplication and change detection
- [ ] Similarity threshold set (typically ≥ 0.7) — low-scoring results filtered out
- [ ] Hybrid search implemented (vector + full-text for better recall)
- [ ] Embeddings generated in batches (not one-by-one)
- [ ] Citation tracking works end-to-end (retrieved chunk → LLM response → user sees source)
- [ ] Incremental ingestion works (only re-embed changed content)
- [ ] Document status tracking (pending → processing → ready / error)
- [ ] RLS policies on documents and chunks tables
- [ ] Error handling on embedding API failures (retry with backoff)
- [ ] Monitoring: track retrieval quality (similarity scores, citation accuracy)

## Common Pitfalls

1. **Wrong chunk size kills quality** — Too small (< 100 tokens): chunks lack context. Too large (> 1000 tokens): chunks are too broad and match everything vaguely. Start at 512 tokens and tune based on retrieval tests.

2. **ivfflat vs HNSW indexing** — ivfflat requires `lists` parameter tuning and periodic re-indexing. HNSW is slower to build but faster to query and doesn't need tuning. Use HNSW for < 1M vectors (covers most apps).

3. **Embedding model mismatch** — If you embed documents with `text-embedding-3-small` but query with `text-embedding-ada-002`, results will be garbage. Always use the same model for ingestion and query.

4. **Missing hybrid search** — Pure vector search struggles with proper nouns, IDs, and exact phrases. "What's policy number ABC-123?" won't work with embeddings alone — you need full-text search as a fallback.

5. **Stale knowledge base** — Documents change but embeddings don't. Implement content hashing and re-ingestion triggers (webhook on file change, nightly cron for URLs).

6. **Context window waste** — Retrieving 20 chunks and stuffing them all into the prompt wastes tokens and confuses the model. Retrieve more than you need, re-rank, and use only the top 3-5.
