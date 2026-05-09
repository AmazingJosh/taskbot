/**
 * Session store — tracks conversation state per user.
 * 
 * Stores:
 * - Active session (multi-step flows like resize, merge, swap)
 * - Last task context (so intent engine understands conversation flow)
 * 
 * Platform agnostic — keyed by userId only.
 * WhatsApp will use the same store unchanged.
 * 
 * Production upgrade: swap Map for Redis.
 */

const sessions = new Map();
const context  = new Map();

const SESSION_TTL = 10 * 60 * 1000; // 10 minutes
const CONTEXT_TTL = 30 * 60 * 1000; // 30 minutes

// ── Session (active multi-step flow) ─────────────────

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
  if (existing) setSession(userId, { ...existing, ...data });
};

// ── Context (last task memory) ────────────────────────

const setLastTask = (userId, task) => {
  context.set(String(userId), {
    lastTask: task,
    expiresAt: Date.now() + CONTEXT_TTL,
  });
};

const getLastTask = (userId) => {
  const ctx = context.get(String(userId));
  if (!ctx) return null;
  if (Date.now() > ctx.expiresAt) {
    context.delete(String(userId));
    return null;
  }
  return ctx;
};

module.exports = {
  setSession,
  getSession,
  clearSession,
  updateSession,
  setLastTask,
  getLastTask,
};