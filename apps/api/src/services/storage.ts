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

export type UploadPurpose = 'task_evidence' | 'id_photo' | 'visitor_photo';

export async function getPresignedUploadUrl(
  purpose: UploadPurpose,
  venueId: string,
  refId: string,          // task_id, visit_id, etc.
  contentType: string,    // e.g. "image/jpeg"
): Promise<{ uploadUrl: string; fileKey: string }> {
  const ext = contentType.split('/')[1] ?? 'bin';
  const fileKey = `${purpose}/${venueId}/${refId}/${Date.now()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileKey,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: PRESIGN_TTL_SECONDS,
  });

  return { uploadUrl, fileKey };
}

export function getPublicUrl(fileKey: string): string {
  return `https://${BUCKET}.s3.${process.env['AWS_REGION'] ?? 'ap-south-1'}.amazonaws.com/${fileKey}`;
}
