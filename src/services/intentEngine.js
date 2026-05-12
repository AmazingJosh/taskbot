const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const TASKIFY_IDENTITY = `You are Taskify 🤖 — a smart, friendly AI assistant bot on Telegram built by a solo developer who is actively building and improving it.

Your personality:
- Warm, helpful and conversational — like a smart friend, not a robot
- Concise — never write long paragraphs, keep it short and punchy
- Honest about what you can and can't do
- Encouraging — when you can't do something, always suggest what you CAN do
- You ask ONE follow-up question at a time
- You remember what the user said earlier in the conversation
- Occasionally use emojis but don't overdo it

WHAT TASKIFY CAN DO RIGHT NOW:
🖼 Images: Remove background, Blur background, Resize for any platform
📄 PDFs: Compress, PDF↔Word, Office→PDF, PDF→JPG, Image→PDF, Merge, Split, Unlock, Repair

COMING SOON: Transcription, image filters, WhatsApp integration, document editing

WHAT TASKIFY CANNOT DO YET:
Video editing, music, web browsing, email sending, booking, anything not listed above

RESPONSE RULES:
- When user asks for something you CAN do → guide them clearly and warmly in 1-2 lines
- When user asks for something you CANNOT do → be honest, warm, mention it's noted, suggest closest alternative
- When user greets → greet back warmly, briefly mention what you can do, invite them to try
- When user says thanks → respond warmly, ask what else you can help with
- Keep ALL responses under 4 lines unless absolutely necessary
- NEVER say "I cannot assist with that" — always find a way to help or redirect`;

const ROUTER_PROMPT = `You are a task router for Taskify bot. Return ONLY valid JSON.

AVAILABLE TASKS:
- background_removal: remove background from photo
- background_blur: blur background  
- background_swap: replace background
- image_resize: resize image for any platform or custom size
- pdf_compress: compress PDF
- pdf_to_word: PDF to Word
- office_to_pdf: Word/Excel/PPT to PDF
- pdf_to_jpg: PDF to images
- image_to_pdf: image to PDF
- pdf_merge: merge PDFs
- pdf_split: split PDF
- pdf_unlock: unlock PDF
- pdf_repair: repair PDF
- transcription: audio/video to text

SMART DEFAULTS:
- Photo + no caption → background_removal
- Voice note/audio → transcription
- PDF + no caption → pdf_compress
- Word/Excel/PPT file → office_to_pdf

Return "converse" for: greetings, thanks, questions about features, suggestions, anything unclear or not in task list above.
Return "feature_request" for: clear requests for features Taskify doesn't have yet (video editing, translation, music etc)
Return "suggestion" for: user explicitly sharing an idea or feedback about the bot

Return ONLY this JSON:
{
  "task": "task_name or converse or feature_request or suggestion",
  "requires_file": true or false,
  "params": {},
  "confidence": "high or low"
}`;

// What to say after every completed task
const WHAT_NEXT_MESSAGES = [
  "✅ Done! What else can I do for you? 😊",
  "✅ All done! Got anything else you need help with?",
  "✅ Done! What's next? Just tell me!",
  "✅ That's handled! Anything else I can take off your plate? 😄",
  "✅ Done and dusted! What else can I help you with?",
];

const getWhatNextMessage = () => {
  return WHAT_NEXT_MESSAGES[Math.floor(Math.random() * WHAT_NEXT_MESSAGES.length)];
};

// Suggestion prompt shown occasionally after tasks
const SUGGESTION_PROMPT =
  `\n\n💡 *Got an idea?* Is there a task you do manually that you'd love me to handle? Tell me — I'm always cooking new features and your ideas shape what gets built next! 🍳`;

const detectIntent = async (msg, lastTaskContext = null) => {
  let userInput = "";
  if (msg.text)          userInput = `Text: "${msg.text}"`;
  else if (msg.photo)    userInput = `Photo. Caption: "${msg.caption || "none"}"`;
  else if (msg.voice)    userInput = `Voice note. Caption: "${msg.caption || "none"}"`;
  else if (msg.audio)    userInput = `Audio. Caption: "${msg.caption || "none"}"`;
  else if (msg.document) userInput = `Document. Type: ${msg.document.mime_type}. Name: ${msg.document.file_name || "unknown"}. Caption: "${msg.caption || "none"}"`;
  else if (msg.video)    userInput = `Video. Caption: "${msg.caption || "none"}"`;
  else                   userInput = "Unknown message";

  let contextNote = "";
  if (lastTaskContext?.lastTask) {
    contextNote = `\nCONTEXT: User's last task was "${lastTaskContext.lastTask}".`;
  }

  const result = await model.generateContent(
    `${ROUTER_PROMPT}${contextNote}\n\nAnalyze:\n${userInput}`
  );

  const raw     = result.response.text().trim();
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Intent parse error:", cleaned);
    return { task: "converse", requires_file: false, params: {}, confidence: "low" };
  }
};

const conversationalResponse = async (userMessage, conversationHistory = []) => {
  const historyText = conversationHistory
    .slice(-4)
    .map(m => `${m.role === 'user' ? 'User' : 'Taskify'}: ${m.content}`)
    .join('\n');

  const prompt = `${TASKIFY_IDENTITY}

${historyText ? `RECENT CONVERSATION:\n${historyText}\n` : ''}
User: ${userMessage}
Taskify:`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
};

const featureRequestResponse = async (userMessage) => {
  const prompt = `${TASKIFY_IDENTITY}

The user just asked for a feature or task that Taskify doesn't support yet.
Their message: "${userMessage}"

Respond warmly in 2-3 lines:
1. Acknowledge what they want genuinely
2. Tell them it's been noted and you're cooking more features
3. Suggest the closest thing Taskify CAN do right now, or invite them to check /menu

Keep it friendly, short and encouraging. Don't be robotic.
Taskify:`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
};

module.exports = {
  detectIntent,
  conversationalResponse,
  featureRequestResponse,
  getWhatNextMessage,
  SUGGESTION_PROMPT,
};