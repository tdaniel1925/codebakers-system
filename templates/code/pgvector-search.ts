/**
 * pgvector Hybrid Search
 * CodeBakers Agent System — Code Template
 *
 * Usage: Copy to lib/rag/search.ts
 * Requires: Supabase with pgvector extension, OpenAI API key, hybrid_search RPC function
 *
 * Features:
 * - Hybrid search: vector similarity + full-text keyword matching
 * - Configurable weighting between vector and keyword scores
 * - Minimum similarity threshold to filter noise
 * - Document-scoped search (filter by specific documents)
 * - Re-ranking by combined score
 * - Citation-ready output with source metadata
 * - RAG prompt builder: injects retrieved context into LLM messages
 * - Query-with-answer: full pipeline from question → search → LLM → cited answer
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// ─── Types ────────────────────────────────────────────────

interface SearchOptions {
  /** Number of results to return (default: 5) */
  topK?: number;
  /** Minimum similarity score 0-1 (default: 0.7) */
  similarityThreshold?: number;
  /** Filter to specific document IDs */
  documentIds?: string[];
  /** Weight for vector similarity vs text rank (default: 0.7 = 70% vector) */
  vectorWeight?: number;
  /** Include full chunk content in results (default: true) */
  includeContent?: boolean;
}

interface SearchResult {
  id: string;
  documentId: string;
  content: string;
  similarity: number;
  textRank: number;
  combinedScore: number;
  metadata: Record<string, unknown>;
}

interface RAGResponse {
  answer: string;
  sources: Source[];
  tokensUsed: { input: number; output: number };
}

interface Source {
  index: number;
  documentId: string;
  documentTitle: string;
  content: string;
  section: string | null;
  similarity: number;
}

// ─── Clients ──────────────────────────────────────────────

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getAnthropic(): Anthropic {
  return new Anthropic();
}

// ─── Embed Query ──────────────────────────────────────────

async function embedQuery(query: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: query,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Embedding error: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// ─── Hybrid Search ────────────────────────────────────────

/**
 * Search the knowledge base using hybrid vector + full-text search.
 *
 * Requires the `hybrid_search` RPC function in Supabase:
 *
 * ```sql
 * CREATE OR REPLACE FUNCTION hybrid_search(
 *   query_embedding VECTOR(1536),
 *   query_text TEXT,
 *   match_count INT DEFAULT 5,
 *   similarity_threshold FLOAT DEFAULT 0.7,
 *   vector_weight FLOAT DEFAULT 0.7,
 *   filter_document_ids UUID[] DEFAULT NULL
 * )
 * RETURNS TABLE (
 *   id UUID,
 *   document_id UUID,
 *   content TEXT,
 *   metadata JSONB,
 *   similarity FLOAT,
 *   text_rank FLOAT,
 *   combined_score FLOAT
 * )
 * LANGUAGE plpgsql AS $$
 * BEGIN
 *   RETURN QUERY
 *   WITH vector_results AS (
 *     SELECT
 *       dc.id, dc.document_id, dc.content, dc.metadata,
 *       1 - (dc.embedding <=> query_embedding) AS similarity,
 *       0::FLOAT AS text_rank
 *     FROM document_chunks dc
 *     WHERE 1 - (dc.embedding <=> query_embedding) > similarity_threshold
 *       AND (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
 *     ORDER BY dc.embedding <=> query_embedding
 *     LIMIT match_count * 3
 *   ),
 *   text_results AS (
 *     SELECT
 *       dc.id, dc.document_id, dc.content, dc.metadata,
 *       0::FLOAT AS similarity,
 *       ts_rank(dc.fts, websearch_to_tsquery('english', query_text)) AS text_rank
 *     FROM document_chunks dc
 *     WHERE dc.fts @@ websearch_to_tsquery('english', query_text)
 *       AND (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
 *     ORDER BY text_rank DESC
 *     LIMIT match_count * 3
 *   ),
 *   combined AS (
 *     SELECT
 *       COALESCE(v.id, t.id) AS id,
 *       COALESCE(v.document_id, t.document_id) AS document_id,
 *       COALESCE(v.content, t.content) AS content,
 *       COALESCE(v.metadata, t.metadata) AS metadata,
 *       COALESCE(v.similarity, 0) AS similarity,
 *       COALESCE(t.text_rank, 0) AS text_rank,
 *       (COALESCE(v.similarity, 0) * vector_weight +
 *        COALESCE(t.text_rank, 0) * (1 - vector_weight)) AS combined_score
 *     FROM vector_results v
 *     FULL OUTER JOIN text_results t ON v.id = t.id
 *   )
 *   SELECT * FROM combined
 *   ORDER BY combined_score DESC
 *   LIMIT match_count;
 * END;
 * $$;
 * ```
 */
export async function hybridSearch(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    topK = 5,
    similarityThreshold = 0.7,
    documentIds,
    vectorWeight = 0.7,
  } = options;

  // 1. Embed the query
  const queryEmbedding = await embedQuery(query);

  // 2. Call hybrid search RPC
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('hybrid_search', {
    query_embedding: JSON.stringify(queryEmbedding),
    query_text: query,
    match_count: topK,
    similarity_threshold: similarityThreshold,
    vector_weight: vectorWeight,
    filter_document_ids: documentIds || null,
  });

  if (error) throw new Error(`Search failed: ${error.message}`);

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    documentId: row.document_id as string,
    content: row.content as string,
    similarity: row.similarity as number,
    textRank: row.text_rank as number,
    combinedScore: row.combined_score as number,
    metadata: (row.metadata as Record<string, unknown>) || {},
  }));
}

/**
 * Vector-only search (simpler, no RPC function required).
 * Uses Supabase's built-in vector similarity via the pgvector extension.
 */
export async function vectorSearch(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    topK = 5,
    similarityThreshold = 0.7,
    documentIds,
  } = options;

  const queryEmbedding = await embedQuery(query);
  const supabase = getSupabase();

  // Use Supabase's match_documents RPC or raw query
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: similarityThreshold,
    match_count: topK,
    filter_document_ids: documentIds || null,
  });

  if (error) {
    // Fallback: try direct query with order by embedding distance
    const { data: fallbackData, error: fbError } = await supabase
      .from('document_chunks')
      .select('id, document_id, content, metadata')
      .limit(topK);

    if (fbError) throw new Error(`Vector search failed: ${fbError.message}`);

    // Note: without RPC, we can't do cosine similarity in the query
    // This fallback returns unranked results
    return (fallbackData || []).map((row) => ({
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      similarity: 0,
      textRank: 0,
      combinedScore: 0,
      metadata: row.metadata || {},
    }));
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    documentId: row.document_id as string,
    content: row.content as string,
    similarity: row.similarity as number,
    textRank: 0,
    combinedScore: row.similarity as number,
    metadata: (row.metadata as Record<string, unknown>) || {},
  }));
}

// ─── RAG Prompt Builder ───────────────────────────────────

/**
 * Build a context block from search results for injection into LLM prompts.
 */
function buildContextBlock(results: SearchResult[]): string {
  if (results.length === 0) return '';

  return results
    .map((r, i) => {
      const section = r.metadata.section ? ` (${r.metadata.section})` : '';
      const docTitle = r.metadata.document_title || 'Unknown';
      return `[Source ${i + 1} — ${docTitle}${section}]\n${r.content}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Build the system prompt for RAG-grounded responses.
 */
function buildRAGSystemPrompt(additionalInstructions = ''): string {
  return `You are a helpful assistant that answers questions based on provided sources.

RULES:
- Answer ONLY based on the provided sources. Do not use prior knowledge.
- Cite sources using [Source N] notation when making claims.
- If the sources don't contain the answer, say: "I don't have enough information to answer that based on the available documents."
- Never fabricate facts, dates, names, or numbers.
- Be concise and direct.
- If sources conflict, note the discrepancy.
${additionalInstructions ? `\n${additionalInstructions}` : ''}`;
}

// ─── Query with RAG ───────────────────────────────────────

/**
 * Full RAG pipeline: question → search → LLM → cited answer.
 */
export async function queryWithRAG(
  question: string,
  options: SearchOptions & {
    /** Additional system prompt instructions */
    systemPromptAddition?: string;
    /** Model to use (default: claude-sonnet-4-20250514) */
    model?: string;
    /** Max tokens for response (default: 1024) */
    maxTokens?: number;
  } = {}
): Promise<RAGResponse> {
  const {
    systemPromptAddition,
    model = 'claude-sonnet-4-20250514',
    maxTokens = 1024,
    ...searchOptions
  } = options;

  // 1. Search for relevant chunks
  const results = await hybridSearch(question, searchOptions);

  if (results.length === 0) {
    return {
      answer: "I don't have enough information to answer that based on the available documents.",
      sources: [],
      tokensUsed: { input: 0, output: 0 },
    };
  }

  // 2. Build context
  const contextBlock = buildContextBlock(results);
  const systemPrompt = buildRAGSystemPrompt(systemPromptAddition);

  // 3. Call LLM
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature: 0, // Deterministic for factual Q&A
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Sources:\n${contextBlock}\n\nQuestion: ${question}`,
      },
    ],
  });

  const answer = response.content[0].type === 'text' ? response.content[0].text : '';

  // 4. Build source list
  const sources: Source[] = results.map((r, i) => ({
    index: i + 1,
    documentId: r.documentId,
    documentTitle: String(r.metadata.document_title || 'Unknown'),
    content: r.content.length > 300 ? r.content.slice(0, 300) + '…' : r.content,
    section: r.metadata.section ? String(r.metadata.section) : null,
    similarity: r.similarity,
  }));

  return {
    answer,
    sources,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

// ─── Streaming RAG Query ──────────────────────────────────

/**
 * Stream a RAG-grounded response. Returns a ReadableStream for SSE.
 */
export async function streamQueryWithRAG(
  question: string,
  options: SearchOptions & {
    systemPromptAddition?: string;
    model?: string;
    maxTokens?: number;
  } = {}
): Promise<{ stream: ReadableStream; sources: Source[] }> {
  const {
    systemPromptAddition,
    model = 'claude-sonnet-4-20250514',
    maxTokens = 1024,
    ...searchOptions
  } = options;

  // 1. Search
  const results = await hybridSearch(question, searchOptions);

  const sources: Source[] = results.map((r, i) => ({
    index: i + 1,
    documentId: r.documentId,
    documentTitle: String(r.metadata.document_title || 'Unknown'),
    content: r.content.length > 300 ? r.content.slice(0, 300) + '…' : r.content,
    section: r.metadata.section ? String(r.metadata.section) : null,
    similarity: r.similarity,
  }));

  if (results.length === 0) {
    const encoder = new TextEncoder();
    const noResultStream = new ReadableStream({
      start(controller) {
        const msg = "I don't have enough information to answer that based on the available documents.";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: msg })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', sources: [] })}\n\n`));
        controller.close();
      },
    });
    return { stream: noResultStream, sources: [] };
  }

  // 2. Build context + stream
  const contextBlock = buildContextBlock(results);
  const systemPrompt = buildRAGSystemPrompt(systemPromptAddition);

  const anthropic = getAnthropic();
  const messageStream = anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    temperature: 0,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Sources:\n${contextBlock}\n\nQuestion: ${question}`,
      },
    ],
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send sources first
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`)
      );

      messageStream.on('text', (text) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'text', text })}\n\n`)
        );
      });

      messageStream.on('end', () => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        );
        controller.close();
      });

      messageStream.on('error', (error) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Search failed' })}\n\n`)
        );
        controller.close();
      });
    },
  });

  return { stream, sources };
}

// ─── Exports ──────────────────────────────────────────────

export {
  embedQuery,
  buildContextBlock,
  buildRAGSystemPrompt,
  type SearchOptions,
  type SearchResult,
  type RAGResponse,
  type Source,
};

// ─── Usage Example ────────────────────────────────────────
//
// // Simple search
// import { hybridSearch } from '@/lib/rag/search';
//
// const results = await hybridSearch('What is the refund policy?', {
//   topK: 5,
//   similarityThreshold: 0.75,
// });
// console.log(results.map(r => `[${r.combinedScore.toFixed(2)}] ${r.content.slice(0, 100)}`));
//
// // Full RAG query
// import { queryWithRAG } from '@/lib/rag/search';
//
// const { answer, sources, tokensUsed } = await queryWithRAG(
//   'What are the payment terms in the contract?',
//   {
//     topK: 5,
//     documentIds: ['specific-doc-uuid'], // Optional: scope to certain docs
//   }
// );
// console.log(answer);
// console.log('Sources:', sources.map(s => s.documentTitle));
// console.log('Cost:', tokensUsed);
//
// // Streaming RAG in an API route
// import { streamQueryWithRAG } from '@/lib/rag/search';
//
// export async function POST(req: Request) {
//   const { question } = await req.json();
//   const { stream, sources } = await streamQueryWithRAG(question);
//   return new Response(stream, {
//     headers: { 'Content-Type': 'text/event-stream' },
//   });
// }
