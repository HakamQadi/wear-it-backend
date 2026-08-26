/**
 * Member media must be an internal upload path produced by POST /api/uploads/image.
 * Rejecting arbitrary remote URLs keeps the AI pipeline from fetching attacker-chosen
 * hosts on the server's behalf.
 */
export const MEDIA_URL_PATTERN = /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export const MEDIA_URL_MESSAGE = 'Image must be uploaded through Wear It first (an /uploads/... path)';
