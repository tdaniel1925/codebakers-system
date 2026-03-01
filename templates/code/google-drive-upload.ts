/**
 * google-drive-upload.ts
 * File upload/download with resumable uploads for large files,
 * folder management, and permission sharing.
 *
 * Usage:
 *   import { DriveManager } from '@/lib/google/drive-manager';
 *   const drive = new DriveManager(userId);
 *   await drive.uploadFile(buffer, 'report.pdf', 'application/pdf');
 */

import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { getAuthenticatedClient } from './auth';

// ─── Drive Manager ──────────────────────────────────────────────────────────

export class DriveManager {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  private async getClient(): Promise<drive_v3.Drive> {
    const authClient = await getAuthenticatedClient(this.userId);
    return google.drive({ version: 'v3', auth: authClient });
  }

  // ─── Upload ─────────────────────────────────────────────────────────────

  /**
   * Upload a file. Uses simple upload for < 5MB, resumable for larger files.
   */
  async uploadFile(
    content: Buffer,
    fileName: string,
    mimeType: string,
    options?: { folderId?: string; description?: string }
  ): Promise<drive_v3.Schema$File> {
    const FIVE_MB = 5 * 1024 * 1024;

    if (content.length < FIVE_MB) {
      return this.simpleUpload(content, fileName, mimeType, options);
    } else {
      return this.resumableUpload(content, fileName, mimeType, options);
    }
  }

  private async simpleUpload(
    content: Buffer,
    fileName: string,
    mimeType: string,
    options?: { folderId?: string; description?: string }
  ): Promise<drive_v3.Schema$File> {
    const drive = await this.getClient();

    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType,
        description: options?.description,
        parents: options?.folderId ? [options.folderId] : undefined,
      },
      media: {
        mimeType,
        body: Readable.from(content),
      },
      fields: 'id, name, mimeType, size, webViewLink, webContentLink, createdTime, modifiedTime',
    });

    return res.data;
  }

  private async resumableUpload(
    content: Buffer,
    fileName: string,
    mimeType: string,
    options?: { folderId?: string; description?: string },
    onProgress?: (uploaded: number, total: number) => void
  ): Promise<drive_v3.Schema$File> {
    const drive = await this.getClient();
    const fileSize = content.length;

    const res = await drive.files.create(
      {
        requestBody: {
          name: fileName,
          mimeType,
          description: options?.description,
          parents: options?.folderId ? [options.folderId] : undefined,
        },
        media: {
          mimeType,
          body: Readable.from(content),
        },
        fields: 'id, name, mimeType, size, webViewLink, webContentLink, createdTime, modifiedTime',
      },
      {
        onUploadProgress: (evt) => {
          if (onProgress && evt.bytesRead) {
            onProgress(evt.bytesRead, fileSize);
          }
        },
      }
    );

    return res.data;
  }

  // ─── Download ───────────────────────────────────────────────────────────

  async downloadFile(fileId: string): Promise<Buffer> {
    const drive = await this.getClient();

    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    return Buffer.from(res.data as ArrayBuffer);
  }

  /**
   * Export Google Workspace files (Docs, Sheets, Slides) to standard formats.
   */
  async exportFile(fileId: string, exportMimeType: string): Promise<Buffer> {
    const drive = await this.getClient();

    const res = await drive.files.export(
      { fileId, mimeType: exportMimeType },
      { responseType: 'arraybuffer' }
    );

    return Buffer.from(res.data as ArrayBuffer);
  }

  // Export mime type helpers
  static EXPORT_FORMATS = {
    docToPdf: 'application/pdf',
    docToDocx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sheetToXlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sheetToCsv: 'text/csv',
    slidesToPptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    slidesToPdf: 'application/pdf',
  };

  // ─── File Operations ────────────────────────────────────────────────────

  async getFile(fileId: string): Promise<drive_v3.Schema$File> {
    const drive = await this.getClient();

    const res = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, webViewLink, webContentLink, createdTime, modifiedTime, parents, shared, owners',
    });

    return res.data;
  }

  async deleteFile(fileId: string): Promise<void> {
    const drive = await this.getClient();
    await drive.files.delete({ fileId });
  }

  async moveFile(fileId: string, newFolderId: string): Promise<drive_v3.Schema$File> {
    const drive = await this.getClient();

    // Get current parents
    const file = await drive.files.get({ fileId, fields: 'parents' });
    const previousParents = (file.data.parents ?? []).join(',');

    const res = await drive.files.update({
      fileId,
      addParents: newFolderId,
      removeParents: previousParents,
      fields: 'id, name, parents, webViewLink',
    });

    return res.data;
  }

  async copyFile(fileId: string, newName?: string, folderId?: string): Promise<drive_v3.Schema$File> {
    const drive = await this.getClient();

    const res = await drive.files.copy({
      fileId,
      requestBody: {
        name: newName,
        parents: folderId ? [folderId] : undefined,
      },
      fields: 'id, name, mimeType, webViewLink',
    });

    return res.data;
  }

  // ─── Folder Operations ──────────────────────────────────────────────────

  async createFolder(name: string, parentFolderId?: string): Promise<drive_v3.Schema$File> {
    const drive = await this.getClient();

    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentFolderId ? [parentFolderId] : undefined,
      },
      fields: 'id, name, webViewLink',
    });

    return res.data;
  }

  async findOrCreateFolder(name: string, parentFolderId?: string): Promise<drive_v3.Schema$File> {
    const drive = await this.getClient();

    // Search for existing folder
    let q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentFolderId) q += ` and '${parentFolderId}' in parents`;

    const res = await drive.files.list({ q, fields: 'files(id, name, webViewLink)', pageSize: 1 });

    if (res.data.files?.length) {
      return res.data.files[0];
    }

    return this.createFolder(name, parentFolderId);
  }

  // ─── List & Search ──────────────────────────────────────────────────────

  async listFiles(options?: {
    folderId?: string;
    query?: string;
    mimeType?: string;
    pageSize?: number;
    pageToken?: string;
    orderBy?: string;
  }): Promise<{ files: drive_v3.Schema$File[]; nextPageToken?: string }> {
    const drive = await this.getClient();

    const parts: string[] = ['trashed = false'];
    if (options?.folderId) parts.push(`'${options.folderId}' in parents`);
    if (options?.query) parts.push(`name contains '${options.query.replace(/'/g, "\\'")}'`);
    if (options?.mimeType) parts.push(`mimeType = '${options.mimeType}'`);

    const res = await drive.files.list({
      q: parts.join(' and '),
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink, thumbnailLink)',
      pageSize: options?.pageSize ?? 50,
      pageToken: options?.pageToken,
      orderBy: options?.orderBy ?? 'modifiedTime desc',
    });

    return {
      files: res.data.files ?? [],
      nextPageToken: res.data.nextPageToken ?? undefined,
    };
  }

  async searchFiles(fullTextQuery: string, pageSize: number = 20): Promise<drive_v3.Schema$File[]> {
    const drive = await this.getClient();

    const res = await drive.files.list({
      q: `fullText contains '${fullTextQuery.replace(/'/g, "\\'")}' and trashed = false`,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
      pageSize,
      orderBy: 'modifiedTime desc',
    });

    return res.data.files ?? [];
  }

  // ─── Permissions & Sharing ──────────────────────────────────────────────

  async shareFile(
    fileId: string,
    email: string,
    role: 'reader' | 'writer' | 'commenter' = 'reader',
    sendNotification: boolean = true
  ): Promise<drive_v3.Schema$Permission> {
    const drive = await this.getClient();

    const res = await drive.permissions.create({
      fileId,
      sendNotificationEmail: sendNotification,
      requestBody: {
        type: 'user',
        role,
        emailAddress: email,
      },
      fields: 'id, type, role, emailAddress',
    });

    return res.data;
  }

  async shareFilePublic(
    fileId: string,
    role: 'reader' | 'writer' = 'reader'
  ): Promise<{ link: string }> {
    const drive = await this.getClient();

    await drive.permissions.create({
      fileId,
      requestBody: {
        type: 'anyone',
        role,
      },
    });

    const file = await drive.files.get({ fileId, fields: 'webViewLink' });
    return { link: file.data.webViewLink! };
  }

  async removePermission(fileId: string, permissionId: string): Promise<void> {
    const drive = await this.getClient();
    await drive.permissions.delete({ fileId, permissionId });
  }

  async listPermissions(fileId: string): Promise<drive_v3.Schema$Permission[]> {
    const drive = await this.getClient();

    const res = await drive.permissions.list({
      fileId,
      fields: 'permissions(id, type, role, emailAddress, displayName)',
    });

    return res.data.permissions ?? [];
  }

  // ─── Watch for Changes ──────────────────────────────────────────────────

  async watchChanges(webhookUrl: string): Promise<{ channelId: string; startPageToken: string }> {
    const drive = await this.getClient();

    // Get start token
    const startRes = await drive.changes.getStartPageToken({});
    const startPageToken = startRes.data.startPageToken!;

    const channelId = crypto.randomUUID();

    await drive.changes.watch({
      pageToken: startPageToken,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        expiration: String(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    return { channelId, startPageToken };
  }
}
