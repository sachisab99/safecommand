import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _client: S3Client | null = null;

function getS3Client(): S3Client {
  if (_client) return _client;
  const region = process.env['AWS_REGION'];
  const accessKeyId = process.env['AWS_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'];
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY must be set');
  }
  _client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  return _client;
}

const BUCKET = process.env['AWS_S3_BUCKET'] ?? 'safecommand-uploads-prod';
const PRESIGN_TTL_SECONDS = 300; // 5 minutes

export type UploadPurpose =
  | 'task_evidence'
  | 'id_photo'
  | 'visitor_photo'
  | 'incident_evidence'; // Phase 5.21 Day 7 — shared incident photo stream (Rec 2b)

export async function getPresignedUploadUrl(
  purpose: UploadPurpose,
  venueId: string,
  refId: string,          // task_id, visit_id, etc.
  contentType: string,    // e.g. "image/jpeg"
): Promise<{ uploadUrl: string; fileKey: string }> {
  const ext = contentType.split('/')[1] ?? 'bin';
  const fileKey = `${purpose}/${venueId}/${refId}/${Date.now()}.${ext}`;

  // Do NOT set ServerSideEncryption here. Including it in the *signed*
  // PutObjectCommand makes `x-amz-server-side-encryption` a REQUIRED signed
  // header on the presigned URL — every client PUT must then echo that exact
  // header or S3 returns 403 SignatureDoesNotMatch. (This is why BR-07
  // photo→S3 was never verified — latent since this file was written.)
  // Encryption at rest is still guaranteed by S3 *bucket default
  // encryption* (SSE-S3/AES256 is applied to every new object automatically
  // since 2023-01-05). Enforce encryption at the bucket (default encryption
  // / Terraform), never by signing the header into presigned URLs.
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: PRESIGN_TTL_SECONDS,
  });

  return { uploadUrl, fileKey };
}

export function getPublicUrl(fileKey: string): string {
  return `https://${BUCKET}.s3.${process.env['AWS_REGION'] ?? 'ap-south-1'}.amazonaws.com/${fileKey}`;
}
