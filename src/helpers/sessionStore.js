const mongoose = require('mongoose');

/**
 * MongoDB-backed session store.
 * Survives server restarts — critical for Render free tier
 * which spins down and restarts frequently.
 * 
 * Platform agnostic — keyed by userId only.
 * Works identically for WhatsApp when added.
 */

// ── Schemas ───────────────────────────────────────────

const sessionSchema = new mongoose.Schema({
  userId:    { type: String, required: true, unique: true },
  data:      { type: mongoose.Schema.Types.Mixed },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

const contextSchema = new mongoose.Schema({
  userId:    { type: String, required: true, unique: true },
  lastTask:  { type: String },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

// TTL indexes — MongoDB auto-deletes expired docs
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
contextSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
const Context = mongoose.models.Context || mongoose.model('Context', contextSchema);

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CONTEXT_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Session (active multi-step flow) ─────────────────

const setSession = async (userId, data) => {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await Session.findOneAndUpdate(
    { userId: String(userId) },
    { data, expiresAt },
    { upsert: true, new: true }
  );
};

const getSession = async (userId) => {
  const doc = await Session.findOne({ userId: String(userId) });
  if (!doc) return null;
  if (doc.expiresAt < new Date()) {
    await Session.deleteOne({ userId: String(userId) });
    return null;
  }
  return doc.data;
};

const clearSession = async (userId) => {
  await Session.deleteOne({ userId: String(userId) });
};

const updateSession = async (userId, data) => {
  const existing = await getSession(userId);
  if (existing) await setSession(userId, { ...existing, ...data });
};

// ── Context (last task memory) ────────────────────────

const setLastTask = async (userId, task) => {
  const expiresAt = new Date(Date.now() + CONTEXT_TTL_MS);
  await Context.findOneAndUpdate(
    { userId: String(userId) },
    { lastTask: task, expiresAt },
    { upsert: true, new: true }
  );
};

const getLastTask = async (userId) => {
  const doc = await Context.findOne({ userId: String(userId) });
  if (!doc) return null;
  if (doc.expiresAt < new Date()) {
    await Context.deleteOne({ userId: String(userId) });
    return null;
  }
  return { lastTask: doc.lastTask };
};

module.exports = {
  setSession,
  getSession,
  clearSession,
  updateSession,
  setLastTask,
  getLastTask,
};