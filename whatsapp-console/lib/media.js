// ------------------------------------------------------------------
//  Local media storage. Files live in public/uploads so the dashboard
//  can render them directly at /uploads/<name>. (For a multi-server
//  deploy, swap this for S3/Cloudinary — only saveBuffer changes.)
// ------------------------------------------------------------------
import fs from 'fs';
import path from 'path';

const UP_DIR = path.join(process.cwd(), 'public', 'uploads');

export function mimeToKind(mime = '') {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
  'application/pdf': 'pdf',
};

// Save bytes to public/uploads and return the public path + kind.
export function saveBuffer(buffer, mime, originalName) {
  if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });
  const ext = (originalName && path.extname(originalName).slice(1)) || EXT[mime] || 'bin';
  const name = `${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;
  fs.writeFileSync(path.join(UP_DIR, name), buffer);
  return { url: `/uploads/${name}`, kind: mimeToKind(mime), mime, filename: originalName || name };
}
