import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
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

// ─── BR-29 post-incident report (server-generated PDF) ─────────────────────
// Server PUTs the rendered PDF buffer to S3, then hands back a time-limited
// presigned GET URL. No ServerSideEncryption header on the command (PR #2 —
// signing it breaks presigned ops; encryption-at-rest is bucket-default).

const REPORT_GET_TTL_SECONDS = 900; // 15 min — enough to open/download

export async function putReportObject(
  venueId: string,
  incidentId: string,
  body: Buffer,
): Promise<string> {
  const fileKey = `incident_reports/${venueId}/${incidentId}/${Date.now()}.pdf`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: fileKey,
      Body: body,
      ContentType: 'application/pdf',
    }),
  );
  return fileKey;
}

// ─── BR-20 venue-wide compliance export (Fire NOC / NABH / Full Audit) ─────
// Same store-then-presign-GET mechanism as BR-29, distinct key prefix so
// compliance PDFs are lifecycle-separable from per-incident reports.
export async function putComplianceReportObject(
  venueId: string,
  reportRef: string,
  body: Buffer,
): Promise<string> {
  const safeRef = reportRef.replace(/[^A-Za-z0-9._-]/g, '_');
  const fileKey = `compliance_reports/${venueId}/${safeRef}/${Date.now()}.pdf`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: fileKey,
      Body: body,
      ContentType: 'application/pdf',
    }),
  );
  return fileKey;
}

export async function presignGetUrl(
  fileKey: string,
  ttlSeconds: number = REPORT_GET_TTL_SECONDS,
): Promise<string> {
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({ Bucket: BUCKET, Key: fileKey }),
    { expiresIn: ttlSeconds },
  );
}

// ─── BR-A per-drill Fire NOC report (server-generated PDF) ─────────────────
// Same store-then-presign-GET mechanism as BR-29; distinct key prefix so
// drill reports are lifecycle-separable. (Appended at EOF deliberately so
// this hunk never conflicts with the BR-20 compliance-export branch, which
// inserts its helper before presignGetUrl.)
export async function putDrillReportObject(
  venueId: string,
  drillId: string,
  body: Buffer,
): Promise<string> {
  const fileKey = `drill_reports/${venueId}/${drillId}/${Date.now()}.pdf`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: fileKey,
      Body: body,
      ContentType: 'application/pdf',
    }),
  );
  return fileKey;
}
