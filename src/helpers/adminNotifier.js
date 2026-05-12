/**
 * adminNotifier.js
 * 
 * Sends important user activity directly to the admin's Telegram.
 * 
 * What gets forwarded to admin:
 * - Feature requests / suggestions
 * - Tasks the bot couldn't handle
 * - User feedback
 * 
 * Setup: Add ADMIN_TELEGRAM_ID to your .env
 * Get your Telegram ID by messaging @userinfobot on Telegram
 */

const notifyAdmin = async (bot, type, data) => {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) return; // silently skip if not configured

  try {
    let message = '';

    switch (type) {
      case 'feature_request':
        message =
          `💡 *New Feature Request*\n\n` +
          `👤 User: ${data.username || 'Anonymous'} (ID: ${data.userId})\n` +
          `💬 They said: "${data.text}"\n\n` +
          `_This user wants something Taskify can't do yet._`;
        break;

      case 'suggestion':
        message =
          `🌟 *User Suggestion*\n\n` +
          `👤 User: ${data.username || 'Anonymous'} (ID: ${data.userId})\n` +
          `💬 Suggestion: "${data.text}"`;
        break;

      case 'task_complete':
        message =
          `✅ *Task Completed*\n\n` +
          `👤 User: ${data.username || 'Anonymous'}\n` +
          `🔧 Task: ${data.task}`;
        break;
    }

    if (message) {
      await bot.sendMessage(adminId, message, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    // Never crash the bot because of admin notification failure
    console.error('Admin notify failed:', err.message);
  }
};

module.exports = { notifyAdmin };