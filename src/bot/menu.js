// menu.js

const MAIN_MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '🚀 Start Magic', callback_data: 'menu_start' },
      ],
      [
        { text: '🖼 Image Tools', callback_data: 'menu_image' },
        { text: '📄 PDF Tools', callback_data: 'menu_docs' },
      ],
    ],
  },
};

const IMAGE_MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '✂️ Remove Background', callback_data: 'task_background_removal' },
      ],
      [
        { text: '⬅️ Back', callback_data: 'menu_main' },
      ],
    ],
  },
};

const DOCS_MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '📦 Compress PDF', callback_data: 'task_pdf_compress' },
        { text: '🔀 Merge PDFs', callback_data: 'task_pdf_merge' },
      ],
      [
        { text: '📄 PDF to Word', callback_data: 'task_pdf_to_word' },
        { text: '🖼 PDF to JPG', callback_data: 'task_pdf_to_jpg' },
      ],
      [
        { text: '📄 Image to PDF', callback_data: 'task_image_to_pdf' },
      ],
      [
        { text: '⬅️ Back', callback_data: 'menu_main' },
      ],
    ],
  },
};

const INTRO_MESSAGE = `
👋 Welcome to *OneClick AI Tools*

We built this bot to make your life easier — no stress, no complicated steps.

⚡ Just send a file or photo… and we do the magic in one click.

Right now you can:
🖼 Remove image backgrounds instantly  
📄 Compress, convert & manage PDFs using iLovePDF

🚧 More powerful AI tools are coming soon:
• Smart image editing
• Advanced document automation
• AI utilities & productivity tools

We are just getting started.

Let’s make work effortless ⚡
Choose a tool below 👇
`;

const STATUS_NOTE = `
⚡ Powered by OneClick AI Tools
More features are added regularly.
`;

const TASK_PROMPTS = {
  background_removal: '✂️ *Remove Background*\n\nSend me the photo you want to process.',
  
  pdf_compress: '📦 *Compress PDF*\n\nSend me your PDF file.',
  pdf_to_word: '📄 *PDF to Word*\n\nSend me a PDF to convert into an editable Word document.',
  pdf_merge: '🔀 *Merge PDFs*\n\nSend me your PDFs one by one.\nWhen done, type *merge now*.',
  pdf_to_jpg: '🖼 *PDF to JPG*\n\nSend me a PDF file to convert into images.',
  image_to_pdf: '📄 *Image to PDF*\n\nSend me an image to convert into PDF.',
};

module.exports = {
  MAIN_MENU,
  IMAGE_MENU,
  DOCS_MENU,
  INTRO_MESSAGE,
  STATUS_NOTE,
  TASK_PROMPTS,
};