import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPresignedUploadUrl, getPublicUrl, type UploadPurpose } from '../services/storage.js';

export const uploadRouter = Router();
uploadRouter.use(requireAuth);

const ALLOWED_PURPOSES: UploadPurpose[] = ['task_evidence', 'id_photo', 'visitor_photo'];
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

// GET /v1/upload/presign?purpose=task_evidence&ref_id=<task_id>&content_type=image/jpeg
// Returns a short-lived S3 presigned PUT URL + the final file key.
// Mobile uploads directly to S3 using the presigned URL, then passes file_key
// in the evidence_url field of POST /tasks/:id/complete.
uploadRouter.get('/presign', async (req: Request, res: Response): Promise<void> => {
  const purpose = req.query['purpose'] as string;
  const refId = req.query['ref_id'] as string;
  const contentType = (req.query['content_type'] as string) ?? 'image/jpeg';

  if (!ALLOWED_PURPOSES.includes(purpose as UploadPurpose)) {
    res.status(400).json({ error: { code: 'INVALID_PURPOSE', message: `purpose must be one of: ${ALLOWED_PURPOSES.join(', ')}` } });
    return;
  }
  if (!refId) {
    res.status(400).json({ error: { code: 'MISSING_REF_ID', message: 'ref_id is required' } });
    return;
  }
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    res.status(400).json({ error: { code: 'INVALID_CONTENT_TYPE', message: `content_type must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}` } });
    return;
  }

  try {
    const { uploadUrl, fileKey } = await getPresignedUploadUrl(
      purpose as UploadPurpose,
      req.auth.venue_id,
      refId,
      contentType,
    );
    res.json({
      upload_url: uploadUrl,
      file_key: fileKey,
      public_url: getPublicUrl(fileKey),
      expires_in: 300,
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'PRESIGN_FAILED', message: 'Could not generate upload URL' } });
  }
});
