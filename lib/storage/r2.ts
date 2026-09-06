import { createHash, createHmac, randomUUID } from 'crypto';

type StoredObject = {
  key: string;
  url: string;
};

type R2Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
};

const r2Region = 'auto';
const r2Service = 's3';

export async function uploadSubmissionLogo(logo: {
  name: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  dataUrl: string;
  chain: string;
}): Promise<StoredObject> {
  const storage = getR2Config();
  const body = dataUrlToBuffer(logo.dataUrl, logo.mimeType);
  const extension = extensionForMime(logo.mimeType);
  const chain = cleanPathSegment(logo.chain || 'unknown');
  const key = `assets/${chain}/logos/${randomUUID()}.${extension}`;
  const url = objectRequestUrl(storage.endpoint, storage.bucket, key);

  const response = await fetch(url, {
    method: 'PUT',
    headers: signedPutHeaders({
      body,
      contentType: logo.mimeType,
      requestUrl: url,
      storage,
    }),
    body,
  });

  if (!response.ok) {
    throw new Error(`R2 upload failed with status ${response.status}.`);
  }

  return {
    key,
    url: storage.publicBaseUrl
      ? publicObjectUrl(storage.publicBaseUrl, key)
      : objectRequestUrl(storage.endpoint, storage.bucket, key),
  };
}

function cleanPathSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getR2Config(): R2Config {
  const endpoint = process.env.R2_ENDPOINT || r2EndpointFromAccountId(process.env.R2_ACCOUNT_ID);
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBaseUrl = process.env.R2_PUBLIC_URL || '';

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('Cloudflare R2 storage is not configured.');
  }

  return {
    endpoint: trimTrailingSlash(endpoint),
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: publicBaseUrl ? trimTrailingSlash(publicBaseUrl) : '',
  };
}

function signedPutHeaders({
  body,
  contentType,
  requestUrl,
  storage,
}: {
  body: Buffer;
  contentType: string;
  requestUrl: string;
  storage: R2Config;
}) {
  const parsedUrl = new URL(requestUrl);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const credentialScope = `${dateStamp}/${r2Region}/${r2Service}/aws4_request`;
  const canonicalRequest = [
    'PUT',
    parsedUrl.pathname,
    parsedUrl.searchParams.toString(),
    `content-type:${contentType}`,
    `host:${parsedUrl.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
    signedHeaders,
    payloadHash,
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = getSigningKey(storage.secretAccessKey, dateStamp);
  const signature = hmacHex(signingKey, stringToSign);

  return {
    Authorization: [
      `AWS4-HMAC-SHA256 Credential=${storage.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', '),
    'Content-Type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
}

function getSigningKey(secretAccessKey: string, dateStamp: string) {
  const dateKey = hmacBuffer(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmacBuffer(dateKey, r2Region);
  const serviceKey = hmacBuffer(regionKey, r2Service);
  return hmacBuffer(serviceKey, 'aws4_request');
}

function dataUrlToBuffer(dataUrl: string, mimeType: string) {
  const prefix = `data:${mimeType};base64,`;
  if (!dataUrl.startsWith(prefix)) throw new Error('Invalid logo data.');
  return Buffer.from(dataUrl.slice(prefix.length), 'base64');
}

function objectRequestUrl(endpoint: string, bucket: string, key: string) {
  const url = new URL(`${trimTrailingSlash(endpoint)}/`);
  url.pathname = joinPath(url.pathname, bucket, key);
  return url.toString();
}

function publicObjectUrl(baseUrl: string, key: string) {
  const url = new URL(`${trimTrailingSlash(baseUrl)}/`);
  url.pathname = joinPath(url.pathname, key);
  return url.toString();
}

function joinPath(...parts: string[]) {
  return `/${parts
    .flatMap((part) => part.split('/'))
    .map((part) => part.trim())
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')}`;
}

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, '');
}

function r2EndpointFromAccountId(accountId?: string) {
  return accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '';
}

function sha256Hex(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex');
}

function hmacBuffer(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest('hex');
}
