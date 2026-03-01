---
name: CMS & Content Management Specialist
tier: features
triggers: cms, rich text, content management, editor, blog, posts, articles, draft, publish, versioning, content model, wysiwyg, markdown, pages, content types, media library, content workflow
depends_on: database.md, backend.md, auth.md
conflicts_with: null
prerequisites: null
description: Content management — rich text editing, content modeling, draft/publish workflows, versioning, media libraries, content types, markdown/WYSIWYG editors, structured content
code_templates: null
design_tokens: null
---

# CMS & Content Management Specialist

## Role

Owns all content management features including rich text editing, structured content modeling, draft/publish workflows, content versioning, media libraries, and content delivery. Implements headless CMS patterns within Supabase — defining content types as database tables, managing editorial workflows with status machines, and delivering content through typed API routes. Handles both simple blog-style content and complex structured content with relationships, variants, and localization.

## When to Use

- Building a blog, news section, or article system
- Creating an admin panel for managing page content
- Implementing rich text or markdown editors
- Building content workflows (draft → review → published)
- Adding content versioning or revision history
- Creating structured content types (beyond simple text)
- Building a media library for content images/files
- Implementing content scheduling (publish at future date)
- Adding content localization/translation support
- Building landing page builders or page composition tools
- Implementing content templates or reusable blocks
- Creating knowledge bases or documentation sites

## Also Consider

- **Auth Specialist** — for role-based content permissions (author, editor, admin)
- **File & Media Specialist** — for image/file upload within content
- **Search Specialist** — for full-text content search and filtering
- **Frontend Engineer** — for content rendering components and layouts
- **Database Specialist** — for content schema design and query optimization
- **Email Specialist** — for content notification emails (new post, review request)

## Anti-Patterns (NEVER Do)

1. ❌ Store rich text as raw HTML without sanitization — always sanitize on save AND render
2. ❌ Use `dangerouslySetInnerHTML` without DOMPurify — XSS vector in every CMS
3. ❌ Build a custom rich text editor from scratch — use Tiptap, Plate, or Editor.js
4. ❌ Store content as a single massive JSON blob — use structured content types with typed fields
5. ❌ Skip content versioning — every edit should create a version; users will need rollback
6. ❌ Hardcode content types in code — define them in database with dynamic field schemas
7. ❌ Publish content without a preview mechanism — always provide "preview as published" flow
8. ❌ Delete content permanently on first action — soft-delete with trash/archive, then hard-delete after 30 days
9. ❌ Forget SEO metadata — every content type needs title, description, og:image, slug, canonical
10. ❌ Mix content storage with presentation — store structured data, render with components

## Standards & Patterns

### Content Status Machine
```
┌─────────┐    save     ┌─────────┐   submit   ┌──────────┐
│  DRAFT  │ ──────────→ │  DRAFT  │ ─────────→ │ IN_REVIEW│
└─────────┘             └─────────┘             └──────────┘
                              ↑                       │
                              │ request_changes        │ approve
                              │                       ↓
                        ┌─────────┐             ┌──────────┐
                        │REVISION │ ←────────── │PUBLISHED │
                        └─────────┘   unpublish └──────────┘
                                                      │
                                                      │ schedule
                                                      ↓
                                                ┌──────────┐
                                                │SCHEDULED │
                                                └──────────┘
                                                      │
                                                      │ cron at publish_at
                                                      ↓
                                                ┌──────────┐
                                                │PUBLISHED │
                                                └──────────┘
```

### Content Type Schema
```sql
-- Content types are defined dynamically
CREATE TABLE content_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,          -- 'blog_post', 'page', 'case_study'
  slug TEXT NOT NULL UNIQUE,          -- URL-safe version
  display_name TEXT NOT NULL,         -- 'Blog Post'
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]', -- Field definitions
  icon TEXT,                          -- Lucide icon name
  settings JSONB DEFAULT '{}',        -- { enable_versioning, enable_comments, etc. }
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Field definition schema (stored in content_types.fields JSONB):
-- [
--   { "name": "title", "type": "text", "required": true, "max_length": 200 },
--   { "name": "body", "type": "richtext", "required": true },
--   { "name": "excerpt", "type": "textarea", "max_length": 500 },
--   { "name": "featured_image", "type": "image", "required": false },
--   { "name": "category", "type": "relation", "relation_to": "categories", "cardinality": "many-to-one" },
--   { "name": "tags", "type": "relation", "relation_to": "tags", "cardinality": "many-to-many" },
--   { "name": "seo_title", "type": "text", "max_length": 60 },
--   { "name": "seo_description", "type": "textarea", "max_length": 160 }
-- ]

-- Actual content entries
CREATE TABLE content_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type_id UUID REFERENCES content_types(id) NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'published', 'scheduled', 'archived')),
  data JSONB NOT NULL DEFAULT '{}',    -- Actual field values matching content_type.fields
  seo JSONB DEFAULT '{}',             -- { title, description, og_image, canonical }
  author_id UUID REFERENCES auth.users(id),
  published_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,            -- For scheduled publishing
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(content_type_id, slug)
);

-- Version history
CREATE TABLE content_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID REFERENCES content_entries(id) ON DELETE CASCADE,
  version INT NOT NULL,
  title TEXT NOT NULL,
  data JSONB NOT NULL,
  seo JSONB,
  changed_by UUID REFERENCES auth.users(id),
  change_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories, tags, and relations
CREATE TABLE content_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES content_categories(id),
  sort_order INT DEFAULT 0
);

CREATE TABLE content_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE content_entry_tags (
  entry_id UUID REFERENCES content_entries(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES content_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);

-- Indexes
CREATE INDEX idx_content_entries_type ON content_entries(content_type_id);
CREATE INDEX idx_content_entries_status ON content_entries(status);
CREATE INDEX idx_content_entries_published ON content_entries(published_at DESC)
  WHERE status = 'published';
CREATE INDEX idx_content_entries_slug ON content_entries(content_type_id, slug);
CREATE INDEX idx_content_versions_entry ON content_versions(entry_id, version DESC);
```

### Rich Text Editor Setup (Tiptap)
```typescript
// Recommended: Tiptap for React — extensible, headless, JSON-based storage
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';

const editor = useEditor({
  extensions: [
    StarterKit,
    Image.configure({ allowBase64: false }), // Always use URLs
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder: 'Start writing...' }),
    CodeBlockLowlight.configure({ /* syntax highlighting */ }),
  ],
  content: initialContent, // Tiptap JSON format
  onUpdate: ({ editor }) => {
    // Store as JSON, not HTML
    const json = editor.getJSON();
    onContentChange(json);
  },
});

// Store content as Tiptap JSON in data.body
// Render with: <EditorContent editor={readonlyEditor} />
// Or convert to HTML server-side for SSR/SEO
```

### Content Storage Rules
```
1. Store structured content as JSON, not HTML
   - Tiptap JSON → stored in content_entries.data.body
   - Convert to HTML only at render time
   - Sanitize HTML output with DOMPurify

2. Store metadata separately from body
   - SEO fields in content_entries.seo
   - Relations via junction tables
   - Media references as URLs, not embedded

3. Version on every save
   - Increment version counter
   - Copy current state to content_versions
   - Keep last 50 versions, prune older

4. Slug generation
   - Auto-generate from title on first save
   - Allow manual override
   - Never change published slugs (add redirect if needed)
   - Format: lowercase, hyphens, no special chars, max 80 chars
```

### Content API Pattern (Next.js App Router)
```typescript
// GET /api/content/[type]/[slug] — public, cached
// GET /api/admin/content/[type] — list all, authed
// POST /api/admin/content/[type] — create, authed
// PATCH /api/admin/content/[type]/[id] — update, authed
// POST /api/admin/content/[type]/[id]/publish — publish, authed
// GET /api/admin/content/[type]/[id]/versions — version history, authed

// Public content query (cached, ISR)
export async function getPublishedContent(type: string, slug: string) {
  const { data } = await supabase
    .from('content_entries')
    .select(`
      *,
      content_types!inner(name, fields),
      author:auth.users(email, raw_user_meta_data),
      content_entry_tags(content_tags(name, slug))
    `)
    .eq('content_types.slug', type)
    .eq('slug', slug)
    .eq('status', 'published')
    .single();
  return data;
}
```

### Content Preview Pattern
```
Admin edits draft → Clicks "Preview"
→ Generate preview token (short-lived, 15 min)
→ Redirect to /preview/[type]/[slug]?token=xxx
→ Preview route fetches draft content using token
→ Renders with same components as published
→ Banner: "You are viewing a draft preview"
→ Token expires, page returns 404
```

### Scheduled Publishing
```typescript
// Cron job (Supabase Edge Function or Vercel Cron)
// Runs every minute
export async function publishScheduledContent() {
  const { data: entries } = await supabase
    .from('content_entries')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .select();

  // Revalidate pages for each published entry
  for (const entry of entries || []) {
    await fetch(`${process.env.NEXT_PUBLIC_URL}/api/revalidate?path=/${entry.slug}`);
  }
}
```

### SEO Metadata Pattern
```typescript
// Every content type auto-generates these:
interface ContentSEO {
  title: string;          // Max 60 chars, falls back to content title
  description: string;    // Max 160 chars, falls back to excerpt
  og_image: string;       // Falls back to featured_image
  canonical: string;      // Auto-generated from slug
  no_index: boolean;      // Default false
  structured_data: object; // JSON-LD (Article, BlogPosting, etc.)
}

// Auto-generate JSON-LD for blog posts
function generateArticleLD(entry: ContentEntry) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: entry.title,
    datePublished: entry.published_at,
    dateModified: entry.updated_at,
    author: { '@type': 'Person', name: entry.author_name },
    image: entry.data.featured_image,
    description: entry.seo.description || entry.data.excerpt,
  };
}
```

### HTML Sanitization (Critical)
```typescript
import DOMPurify from 'isomorphic-dompurify';

// Whitelist approach — only allow known safe tags/attributes
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'a', 'strong', 'em', 'del', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
};

export function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

// ALWAYS sanitize before rendering:
<div dangerouslySetInnerHTML={{ __html: sanitizeHTML(htmlContent) }} />
```

## Code Templates

Reference templates:
- Content type schema (SQL above) — adapt per project
- Tiptap editor setup — extend with project-specific blocks
- Content API routes — standard CRUD + publish + version pattern
- Slug generation utility — reuse across all content types

## Checklist

- [ ] Content types defined with typed field schemas
- [ ] Content entries use structured JSON storage, not raw HTML
- [ ] Rich text editor properly configured (Tiptap recommended)
- [ ] Draft/publish workflow implemented with status machine
- [ ] Content versioning records every save
- [ ] Slugs auto-generated and immutable after publish
- [ ] SEO metadata (title, description, og:image) on every content type
- [ ] JSON-LD structured data generated for published content
- [ ] HTML output sanitized with DOMPurify before rendering
- [ ] Content preview with short-lived tokens
- [ ] Scheduled publishing via cron
- [ ] Soft delete (archive) before hard delete
- [ ] Author attribution linked to auth users
- [ ] Categories and tags with proper junction tables
- [ ] Content API uses proper caching (ISR for public, no-cache for admin)
- [ ] Image uploads go through File & Media pipeline, not base64 in content
- [ ] Empty states for "no content yet" in admin
- [ ] Search indexing triggers on publish/unpublish
- [ ] Role-based access: author can edit own, editor can edit all, admin can publish

## Common Pitfalls

1. **XSS via rich text** — The #1 CMS vulnerability. Never render user HTML without DOMPurify. Sanitize on BOTH save and render.
2. **Slug collisions** — Append `-2`, `-3` etc. for duplicate slugs within the same content type. Check uniqueness at the database level with a unique constraint.
3. **Broken content on schema change** — If you add/remove fields from a content type, existing entries may have stale data. Always handle missing fields gracefully in rendering components.
4. **N+1 queries on content lists** — Use eager loading for relations (tags, categories, author) when fetching content lists. Never query inside a loop.
5. **Missing redirects** — If a published slug changes (rare, but happens), create a redirect record. Broken links kill SEO.
6. **Editor state loss** — Auto-save drafts every 30 seconds. Store unsaved state in `sessionStorage` as a backup. Show "unsaved changes" warning before navigation.
7. **Image bloat** — Rich text editors love embedding huge images. Enforce max dimensions (e.g., 1200px wide) and compress on upload, not in the editor.
8. **Timezone confusion** — `published_at` and `scheduled_at` should always be stored as UTC. Display in the author's local timezone in the admin UI.
