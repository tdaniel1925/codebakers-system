/**
 * File Upload Component
 * CodeBakers Agent System — Code Template
 *
 * Usage: Copy to components/ui/file-upload.tsx
 * Requires: @supabase/supabase-js
 *
 * Features: Drag & drop, progress bar, image preview, multi-file,
 * file type validation, size limits, Supabase Storage integration.
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ────────────────────────────────────────────────

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  path: string; // Storage path for deletion
}

interface FileUploadProps {
  bucket: string;                        // Supabase Storage bucket name
  folder?: string;                       // Subfolder path (e.g., 'avatars', 'documents')
  accept?: string;                       // MIME types (e.g., 'image/*', '.pdf,.docx')
  maxFiles?: number;                     // Max simultaneous uploads (default: 5)
  maxSizeMB?: number;                    // Max file size in MB (default: 10)
  multiple?: boolean;                    // Allow multiple files
  onUploadComplete?: (files: UploadedFile[]) => void;
  onUploadError?: (error: string) => void;
  existingFiles?: UploadedFile[];        // Pre-populated files
  className?: string;
}

interface FileProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
  result?: UploadedFile;
}

// ─── Helpers ──────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function generateFilePath(folder: string, fileName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const ext = fileName.split('.').pop() || '';
  const safeName = fileName
    .replace(/\.[^/.]+$/, '') // remove extension
    .replace(/[^a-zA-Z0-9-_]/g, '_') // sanitize
    .slice(0, 50); // truncate
  return `${folder}/${timestamp}-${random}-${safeName}.${ext}`;
}

function isImageFile(type: string): boolean {
  return type.startsWith('image/');
}

// ─── Component ────────────────────────────────────────────

export function FileUpload({
  bucket,
  folder = 'uploads',
  accept,
  maxFiles = 5,
  maxSizeMB = 10,
  multiple = true,
  onUploadComplete,
  onUploadError,
  existingFiles = [],
  className = '',
}: FileUploadProps) {
  const [files, setFiles] = useState<FileProgress[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>(existingFiles);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  // ── Validation ──────────────────────────────────────────

  const validateFile = useCallback(
    (file: File): string | null => {
      if (file.size > maxSizeBytes) {
        return `File too large: ${formatFileSize(file.size)} (max ${maxSizeMB}MB)`;
      }
      if (accept) {
        const acceptedTypes = accept.split(',').map((t) => t.trim());
        const isAccepted = acceptedTypes.some((type) => {
          if (type.startsWith('.')) {
            return file.name.toLowerCase().endsWith(type.toLowerCase());
          }
          if (type.endsWith('/*')) {
            return file.type.startsWith(type.replace('/*', '/'));
          }
          return file.type === type;
        });
        if (!isAccepted) {
          return `File type not allowed: ${file.type || file.name.split('.').pop()}`;
        }
      }
      return null;
    },
    [accept, maxSizeBytes, maxSizeMB]
  );

  // ── Upload Single File ──────────────────────────────────

  const uploadFile = useCallback(
    async (file: File, index: number) => {
      const path = generateFilePath(folder, file.name);

      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: 'uploading' as const, progress: 0 } : f
        )
      );

      try {
        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (error) throw error;

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from(bucket).getPublicUrl(data.path);

        const uploaded: UploadedFile = {
          id: data.path,
          name: file.name,
          size: file.size,
          type: file.type,
          url: publicUrl,
          path: data.path,
        };

        setFiles((prev) =>
          prev.map((f, i) =>
            i === index
              ? { ...f, status: 'complete' as const, progress: 100, result: uploaded }
              : f
          )
        );

        return uploaded;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Upload failed';
        setFiles((prev) =>
          prev.map((f, i) =>
            i === index ? { ...f, status: 'error' as const, error: errorMsg } : f
          )
        );
        return null;
      }
    },
    [bucket, folder]
  );

  // ── Process Files ───────────────────────────────────────

  const processFiles = useCallback(
    async (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles);
      const totalFiles = uploadedFiles.length + fileArray.length;

      if (totalFiles > maxFiles) {
        onUploadError?.(`Maximum ${maxFiles} files allowed`);
        return;
      }

      // Validate all files first
      const validFiles: File[] = [];
      for (const file of fileArray) {
        const error = validateFile(file);
        if (error) {
          onUploadError?.(error);
        } else {
          validFiles.push(file);
        }
      }

      if (validFiles.length === 0) return;

      // Add to progress tracking
      const newProgress: FileProgress[] = validFiles.map((file) => ({
        file,
        progress: 0,
        status: 'pending' as const,
      }));
      setFiles((prev) => [...prev, ...newProgress]);

      // Upload all files
      const startIndex = files.length;
      const results = await Promise.all(
        validFiles.map((file, i) => uploadFile(file, startIndex + i))
      );

      const successful = results.filter(Boolean) as UploadedFile[];
      if (successful.length > 0) {
        const updated = [...uploadedFiles, ...successful];
        setUploadedFiles(updated);
        onUploadComplete?.(updated);
      }
    },
    [files.length, maxFiles, onUploadComplete, onUploadError, uploadFile, uploadedFiles, validateFile]
  );

  // ── Delete File ─────────────────────────────────────────

  const deleteFile = useCallback(
    async (fileToDelete: UploadedFile) => {
      const { error } = await supabase.storage
        .from(bucket)
        .remove([fileToDelete.path]);

      if (error) {
        onUploadError?.(`Failed to delete: ${error.message}`);
        return;
      }

      const updated = uploadedFiles.filter((f) => f.id !== fileToDelete.id);
      setUploadedFiles(updated);
      onUploadComplete?.(updated);
    },
    [bucket, onUploadComplete, onUploadError, uploadedFiles]
  );

  // ── Drag & Drop ─────────────────────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current -= 1;
    if (dragCountRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current = 0;
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  // ── Render ──────────────────────────────────────────────

  return (
    <div className={className}>
      {/* Drop Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        aria-label="Upload files"
        style={{
          border: `2px dashed ${isDragOver ? '#3b82f6' : '#d1d5db'}`,
          borderRadius: '8px',
          padding: '32px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragOver ? '#eff6ff' : '#fafafa',
          transition: 'all 150ms ease',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(e) => e.target.files && processFiles(e.target.files)}
          style={{ display: 'none' }}
        />
        <div style={{ color: '#6b7280', fontSize: '14px' }}>
          <p style={{ margin: '0 0 4px', fontWeight: 500 }}>
            {isDragOver ? 'Drop files here' : 'Click or drag files to upload'}
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
            {accept ? `Accepted: ${accept}` : 'Any file type'} · Max {maxSizeMB}MB
            {maxFiles > 1 ? ` · Up to ${maxFiles} files` : ''}
          </p>
        </div>
      </div>

      {/* Upload Progress */}
      {files.filter((f) => f.status !== 'complete').length > 0 && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {files
            .filter((f) => f.status !== 'complete')
            .map((f, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: f.status === 'error' ? '#fef2f2' : '#f9fafb',
                  fontSize: '13px',
                }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.file.name}
                </span>
                {f.status === 'uploading' && (
                  <div style={{ width: '100px', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '2px' }}>
                    <div
                      style={{
                        width: `${f.progress}%`,
                        height: '100%',
                        backgroundColor: '#3b82f6',
                        borderRadius: '2px',
                        transition: 'width 300ms ease',
                      }}
                    />
                  </div>
                )}
                {f.status === 'error' && (
                  <span style={{ color: '#ef4444', fontSize: '12px' }}>{f.error}</span>
                )}
                {f.status === 'pending' && (
                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>Waiting...</span>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                fontSize: '13px',
              }}
            >
              {/* Thumbnail for images */}
              {isImageFile(file.type) && (
                <img
                  src={file.url}
                  alt={file.name}
                  style={{
                    width: '40px',
                    height: '40px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <p style={{ margin: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.name}
                </p>
                <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: '12px' }}>
                  {formatFileSize(file.size)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteFile(file);
                }}
                aria-label={`Delete ${file.name}`}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  padding: '4px',
                  fontSize: '16px',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Avatar Upload Variant ────────────────────────────────
// Single image upload with circular preview

export function AvatarUpload({
  bucket,
  folder = 'avatars',
  currentUrl,
  onUpload,
  size = 96,
}: {
  bucket: string;
  folder?: string;
  currentUrl?: string;
  onUpload: (url: string) => void;
  size?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | undefined>(currentUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return; // 5MB max for avatars

    // Preview immediately
    setPreview(URL.createObjectURL(file));
    setUploading(true);

    try {
      const path = generateFilePath(folder, file.name);
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(data.path);

      setPreview(publicUrl);
      onUpload(publicUrl);
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setPreview(currentUrl); // Revert
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
        backgroundColor: '#f3f4f6',
        border: '2px solid #e5e7eb',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        style={{ display: 'none' }}
      />
      {preview ? (
        <img
          src={preview}
          alt="Avatar"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            fontSize: size * 0.3,
          }}
        >
          +
        </div>
      )}
      {uploading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '12px',
          }}
        >
          ...
        </div>
      )}
    </div>
  );
}
