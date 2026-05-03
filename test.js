require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ILovePDFApi = require('@ilovepdf/ilovepdf-nodejs');

const instance = new ILovePDFApi(
  process.env.ILOVEPDF_PUBLIC_KEY,
  process.env.ILOVEPDF_SECRET_KEY
);

// ✅ helper to download file
async function downloadFile(url, filename) {
  const res = await axios.get(url, { responseType: 'stream' });
  const filePath = path.join(__dirname, filename);

  const writer = fs.createWriteStream(filePath);
  res.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(filePath));
    writer.on('error', reject);
  });
}

async function mergePDFs() {
  try {
    console.log('⬇️ Downloading files locally...');

    const file1 = await downloadFile(
      'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      'file1.pdf'
    );

    const file2 = await downloadFile(
      'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      'file2.pdf'
    );

    const task = instance.newTask('merge');

    console.log('🚀 Starting task...');
    await task.start();

    console.log('📂 Uploading local files...');
    await task.addFile(file1);
    await task.addFile(file2);

    console.log('⚙️ Processing...');
    await task.process();

    console.log('⬇️ Downloading result...');
    const data = await task.download();

    fs.writeFileSync('merged.pdf', data);

    console.log('✅ DONE');
  } catch (err) {
    console.error('❌ ERROR:', err.response?.data || err.message);
  }
}

mergePDFs();