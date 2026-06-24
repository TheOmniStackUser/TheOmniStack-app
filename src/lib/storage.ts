import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  HeadBucketCommand, 
  CreateBucketCommand,
  HeadObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ─── Client for uploads (uses internal Docker hostname, e.g. http://minio:9000) ──
const s3UploadClient = new S3Client({
  region: process.env.S3_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: (process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID)!,
    secretAccessKey: (process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY)!,
  },
})

// ─── Client for signed URLs (uses public hostname, e.g. http://localhost:9000) ──
// The HMAC signature is bound to the endpoint hostname, so the client used for
// signing must use the same hostname that the browser will actually request.
const s3SigningClient = new S3Client({
  region: process.env.S3_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
  endpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: (process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID)!,
    secretAccessKey: (process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY)!,
  },
})

function getBucketName() {
  const bucket = process.env.S3_BUCKET_NAME || 
                 process.env.AWS_BUCKET_NAME || 
                 process.env.AWS_S3_BUCKET_NAME || 
                 process.env.AWS_S3_BUCKET ||
                 process.env.BUCKET_NAME

  if (!bucket) {
    console.error('[Storage] ERROR: No S3 bucket name configured in environment variables. Falling back to default "profifaktura-storage".')
    return 'profifaktura-storage'
  }

  return bucket
}

let isBucketReady = false

/**
 * Ensures the target bucket exists.
 */
async function ensureBucketExists() {
  if (isBucketReady) return
  const bucket = getBucketName()
  console.log(`[Storage] Checking bucket: "${bucket}" at endpoint: "${process.env.S3_ENDPOINT}"`)
  try {
    // Try to create the bucket directly. If it exists, it might throw an error depending on the S3 provider.
    // MinIO and AWS S3 behave slightly differently here.
    await s3UploadClient.send(new CreateBucketCommand({ Bucket: bucket }))
    console.log(`[Storage] Bucket "${bucket}" created.`)
    isBucketReady = true
  } catch (error: any) {
    // Ignore errors if the bucket already exists
    if (
      error.name === 'BucketAlreadyOwnedByYou' || 
      error.name === 'BucketAlreadyExists' ||
      error.$metadata?.httpStatusCode === 409
    ) {
      isBucketReady = true
    } else if (error.$metadata?.httpStatusCode === 403) {
      // Permission denied - maybe it exists but we can't 'create' it, which is fine for existing buckets
      console.warn(`[Storage] Permission denied when creating bucket "${bucket}". Assuming it exists.`)
      isBucketReady = true
    } else {
      console.error(`[Storage] Unexpected error during bucket check/creation for "${bucket}":`, error)
      try {
        const fs = require('fs')
        const logMsg = `[${new Date().toISOString()}] Error: ${error.message}\nStack: ${error.stack}\nBucket: ${bucket}\nEndpoint: ${process.env.S3_ENDPOINT}\n---\n`
        fs.appendFileSync('storage-debug.log', logMsg)
      } catch (e) {
        console.error('Failed to write to debug log:', e)
      }
      throw error
    }
  }
}

// ─── Storage Operations ───────────────────────────────────────────────────────

/**
 * Upload a PDF document to S3 / MinIO.
 * Uses the internal endpoint for server-to-server communication.
 */
export async function uploadDocument(
  key: string,
  buffer: Buffer,
  contentType = 'application/pdf'
): Promise<string> {
  await ensureBucketExists()
  const normalizedBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  await s3UploadClient.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: normalizedBuffer,
      ContentLength: normalizedBuffer.byteLength,
      ContentType: contentType,
    })
  )
  return key
}

/**
 * Download a stored document from S3.
 */
export async function downloadDocument(key: string): Promise<Buffer> {
  await ensureBucketExists()
  const response = await s3UploadClient.send(
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    })
  )
  if (!response.Body) {
    throw new Error(`No body in S3 response for key ${key}`)
  }
  const bytes = await response.Body.transformToByteArray()
  return Buffer.from(bytes)
}

/**
 * Check if a document exists in S3.
 */
export async function documentExists(key: string): Promise<boolean> {
  try {
    await ensureBucketExists()
    await s3UploadClient.send(
      new HeadObjectCommand({
        Bucket: getBucketName(),
        Key: key,
      })
    )
    return true
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false
    }
    throw error
  }
}

/**
 * Delete a document from S3.
 */
export async function deleteDocument(key: string): Promise<boolean> {
  try {
    await ensureBucketExists()
    await s3UploadClient.send(
      new DeleteObjectCommand({
        Bucket: getBucketName(),
        Key: key,
      })
    )
    return true
  } catch (error: any) {
    return false
  }
}

/**
 * Generate a time-limited signed URL for viewing a stored document.
 * Uses the public endpoint so the browser can resolve the URL.
 */
export async function getDocumentUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const command = new GetObjectCommand({ 
    Bucket: getBucketName(), 
    Key: key,
    ResponseContentType: 'application/pdf',
    ResponseContentDisposition: 'inline'
  })
  return getSignedUrl(s3SigningClient, command, { expiresIn: expiresInSeconds })
}

/**
 * Build a consistent storage key for an invoice PDF.
 * Format: {companyId}/invoices/{year}/{invoiceNumber}.pdf
 */
export function buildInvoiceKey(
  companyId: string,
  invoiceNumber: string,
  year = new Date().getFullYear()
): string {
  const safeNumber = invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, '_')
  return `${companyId}/invoices/${year}/${safeNumber}.pdf`
}

/**
 * Build a consistent storage key for a delivery note PDF.
 * Format: {companyId}/delivery-notes/{orderId}.pdf
 */
export function buildDeliveryNoteKey(
  companyId: string,
  orderId: string
): string {
  return `${companyId}/delivery-notes/${orderId}.pdf`
}
