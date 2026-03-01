---
name: File & Media Specialist
tier: features
triggers: upload, file upload, image upload, media, storage, CDN, crop, resize, avatar, gallery, drag and drop, Supabase Storage, S3, progress bar, file picker
depends_on: backend.md, security.md
conflicts_with: null
prerequisites: null
description: File uploads, image processing, Supabase Storage, CDN, crop/resize, progress bars, drag-and-drop
code_templates: file-upload-component.tsx
design_tokens: null
---

# File & Media Specialist

## Role

Owns all file upload, storage, and media processing. Implements drag-and-drop uploads with progress bars, image crop/resize, Supabase Storage bucket management, CDN-served URLs, and proper access control. Handles file type validation, size limits, malware scanning patterns, and optimized delivery. Ensures uploads are resilient (resumable), accessible, and secure.

## When to Use

- Building file upload interfaces (single, multi, drag-and-drop)
- Implementing avatar/profile image upload with cropping
- Creating image galleries or media libraries
- Setting up Supabase Storage buckets and policies
- Building document upload for PDFs, spreadsheets, etc.
- Implementing file download with access control
- Optimizing image delivery (resizing, format conversion, CDN)
- Adding progress bars to uploads

## Also Consider

- **Security Specialist** — for file type validation and malware scanning patterns
- **Database Specialist** — for file metadata storage and queries
- **Performance Engineer** — for image optimization and lazy loading
- **Frontend Engineer** — for upload UI components and drag-and-drop

## Anti-Patterns (NEVER Do)

1. ❌ Trust client-side file type checking alone — always validate on server
2. ❌ Store files in the database — use object storage (Supabase Storage)
3. ❌ Expose storage bucket URLs directly — use signed URLs for private files
4. ❌ Skip file size limits — always enforce on client AND server
5. ❌ Allow unlimited file types — whitelist allowed MIME types
6. ❌ Upload without progress indication — always show progress
7. ❌ Process images on the main thread — use workers or server-side processing
8. ❌ Store original filenames as-is — sanitize and use UUID-based names
9. ❌ Forget cleanup on failed uploads — delete orphaned files
10. ❌ Serve user-uploaded content from your domain — use a separate CDN subdomain

## Standards & Patterns

### Supabase Storage Setup
```sql
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),         -- public: profile pictures
  ('documents', 'documents', false),     -- private: user documents
  ('media', 'media', true);             -- public: content images

-- Bucket policies
CREATE POLICY "Avatar upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatar view" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Document upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users view own docs" ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
```

### Upload Utility
```typescript
interface UploadOptions {
  bucket: string;
  file: File;
  path: string;
  maxSize?: number;        // bytes, default 5MB
  allowedTypes?: string[]; // MIME types
  onProgress?: (percent: number) => void;
}

async function uploadFile({
  bucket, file, path, maxSize = 5 * 1024 * 1024,
  allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  onProgress,
}: UploadOptions) {
  // Client-side validation
  if (file.size > maxSize) {
    throw new Error(`File too large. Max ${maxSize / 1024 / 1024}MB`);
  }
  if (!allowedTypes.includes(file.type)) {
    throw new Error(`File type not allowed: ${file.type}`);
  }

  // Generate safe filename
  const ext = file.name.split('.').pop()?.toLowerCase();
  const safeName = `${crypto.randomUUID()}.${ext}`;
  const fullPath = `${path}/${safeName}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fullPath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (error) throw error;

  // Get public URL for public buckets
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return { path: data.path, url: publicUrl };
}
```

### Drag-and-Drop Upload Component
```tsx
function FileUpload({
  bucket, path, maxFiles = 5, maxSize = 5 * 1024 * 1024,
  accept = 'image/*', onUpload,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList) => {
    const fileArray = Array.from(files).slice(0, maxFiles);

    for (const file of fileArray) {
      const id = crypto.randomUUID();
      setUploads((prev) => [...prev, { id, name: file.name, progress: 0, status: 'uploading' }]);

      try {
        const result = await uploadFile({
          bucket, file, path,
          maxSize,
          onProgress: (percent) => {
            setUploads((prev) =>
              prev.map((u) => u.id === id ? { ...u, progress: percent } : u)
            );
          },
        });

        setUploads((prev) =>
          prev.map((u) => u.id === id ? { ...u, status: 'done', url: result.url } : u)
        );
        onUpload?.(result);
      } catch (err) {
        setUploads((prev) =>
          prev.map((u) => u.id === id ? { ...u, status: 'error', error: err.message } : u)
        );
      }
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload files"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
        ${isDragging ? 'border-accent bg-accent/5' : 'border-border'}`}
    >
      <input ref={inputRef} type="file" accept={accept} multiple hidden
        onChange={(e) => e.target.files && handleFiles(e.target.files)} />
      <p>Drag files here or click to browse</p>
      <p className="text-sm text-muted-foreground">Max {maxSize / 1024 / 1024}MB per file</p>

      {uploads.map((upload) => (
        <div key={upload.id} className="mt-2">
          <span>{upload.name}</span>
          {upload.status === 'uploading' && (
            <div className="w-full bg-muted rounded h-2">
              <div className="bg-accent h-2 rounded" style={{ width: `${upload.progress}%` }} />
            </div>
          )}
          {upload.status === 'error' && <span className="text-destructive">{upload.error}</span>}
        </div>
      ))}
    </div>
  );
}
```

### Image Optimization
```typescript
// Use Supabase image transformation for on-the-fly resizing
function getOptimizedImageUrl(path: string, options: { width?: number; height?: number; quality?: number }) {
  const { data } = supabase.storage
    .from('media')
    .getPublicUrl(path, {
      transform: {
        width: options.width || 800,
        height: options.height || 600,
        quality: options.quality || 80,
        resize: 'cover',
      },
    });
  return data.publicUrl;
}

// Generate srcSet for responsive images
function getResponsiveSrcSet(path: string) {
  const widths = [320, 640, 960, 1280];
  return widths
    .map((w) => `${getOptimizedImageUrl(path, { width: w })} ${w}w`)
    .join(', ');
}
```

### Signed URLs for Private Files
```typescript
async function getPrivateFileUrl(bucket: string, path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) throw error;
  return data.signedUrl;
}
```

### File Metadata Table
```sql
CREATE TABLE file_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_file_metadata_user ON file_metadata(user_id);
```

## Code Templates

- **`file-upload-component.tsx`** — Complete drag-and-drop upload component with progress, validation, preview, and error handling

## Checklist

- [ ] Storage buckets created with appropriate public/private settings
- [ ] RLS policies set on storage.objects for each bucket
- [ ] File type validation on both client and server
- [ ] File size limits enforced (client + server)
- [ ] Filenames sanitized (UUID-based, safe extensions only)
- [ ] Upload progress shown with visual indicator
- [ ] Drag-and-drop works and is accessible (keyboard, ARIA)
- [ ] Image optimization configured (resizing, quality, format)
- [ ] Signed URLs used for private file access
- [ ] File metadata stored in database for queries
- [ ] Orphan cleanup for failed uploads
- [ ] Error states shown clearly for failed uploads
- [ ] Multiple file upload with individual progress tracking

## Common Pitfalls

1. **CORS issues** — Supabase Storage needs CORS configured for client-side uploads. Check bucket CORS settings.
2. **Filename collisions** — Always use UUID-based names. Two users uploading `photo.jpg` would overwrite each other.
3. **Memory on large files** — Don't load entire files into memory. Stream where possible. For very large files, use multipart upload.
4. **Missing cleanup** — Failed uploads leave orphaned files in storage. Implement periodic cleanup or on-error deletion.
5. **Image orientation** — EXIF data can cause images to display rotated. Strip or honor EXIF orientation during processing.
