/**
 * In-memory session store.
 * Handles ALL multi-step conversation flows across the bot.
 *
 * Session steps:
 * - waiting_for_photo         : bot asked user to send a photo for a task
 * - waiting_for_background    : background swap flow, waiting for bg photo
 * - waiting_for_meme_text     : meme generator, waiting for top/bottom text
 * - waiting_for_translate_text: translation, waiting for text input
 * - waiting_for_tts_text      : text to speech, waiting for text
 *
 * Platform agnostic — sessions keyed by userId only.
 * When WhatsApp arrives, this works identically.
 *
 * Production upgrade path: swap Map for Redis.
 */

const sessions = new Map();
const SESSION_TTL = 10 * 60 * 1000; // 10 minutes

const setSession = (userId, data) => {
  sessions.set(String(userId), {
    ...data,
    expiresAt: Date.now() + SESSION_TTL,
  });
};

const getSession = (userId) => {
  const session = sessions.get(String(userId));
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(String(userId));
    return null;
  }
  return session;
};

const clearSession = (userId) => {
  sessions.delete(String(userId));
};

const updateSession = (userId, data) => {
  const existing = getSession(userId);
  if (existing) {
    setSession(userId, { ...existing, ...data });
  }
};

module.exports = { setSession, getSession, clearSession, updateSession };