export const DISPUTE_EVIDENCE_BUCKET = 'market-dispute-evidence';
export const DISPUTE_EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;
export const DISPUTE_EVIDENCE_MAX_PER_USER = 8;

export const disputeEvidenceMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]);

export function safeEvidenceFile(input: { fileName: unknown; mimeType: unknown; sizeBytes: unknown }) {
  const originalName = String(input.fileName || '').trim();
  const mimeType = String(input.mimeType || '').trim().toLowerCase();
  const sizeBytes = Number(input.sizeBytes);
  if (!originalName || originalName.length > 180) throw new Error('EVIDENCE_FILE_NAME_INVALID');
  if (!disputeEvidenceMimeTypes.has(mimeType)) throw new Error('EVIDENCE_FILE_TYPE_INVALID');
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > DISPUTE_EVIDENCE_MAX_BYTES) {
    throw new Error('EVIDENCE_FILE_SIZE_INVALID');
  }
  const extension = mimeType === 'application/pdf'
    ? 'pdf'
    : mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/webp'
        ? 'webp'
        : 'jpg';
  const fileName = originalName.replace(/[^a-zA-Z0-9._ -]+/g, '').replace(/\s+/g, ' ').slice(0, 180) || `evidence.${extension}`;
  return { fileName, mimeType, sizeBytes, extension };
}

export function evidenceSignatureMatches(mimeType: string, bytes: Uint8Array) {
  if (mimeType === 'application/pdf') {
    return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
  }
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  return false;
}

export function calculateDisputeSplit(input: {
  customerTotalCents: number;
  refundedBeforeCents: number;
  requestedRefundCents: number;
  platformFeeCents: number;
  shippingLiabilityCents: number;
}) {
  const values = Object.values(input);
  if (values.some((value) => !Number.isInteger(value) || value < 0)) throw new Error('REFUND_AMOUNT_INVALID');
  const remainingBefore = input.customerTotalCents - input.refundedBeforeCents;
  if (input.requestedRefundCents < 1 || input.requestedRefundCents > remainingBefore) {
    throw new Error('REFUND_AMOUNT_EXCEEDS_REMAINING');
  }
  const refundedTotalCents = input.refundedBeforeCents + input.requestedRefundCents;
  const customerRemainingCents = input.customerTotalCents - refundedTotalCents;
  const sellerReleaseCents = Math.max(
    0,
    customerRemainingCents - input.platformFeeCents - input.shippingLiabilityCents
  );
  return {
    refundedTotalCents,
    customerRemainingCents,
    sellerReleaseCents,
    fullRefund: refundedTotalCents === input.customerTotalCents
  };
}
