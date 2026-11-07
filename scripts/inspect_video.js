const puppeteer = require('C:\\Users\\RAJESH\\Desktop\\FleetFlow\\frontend\\node_modules\\puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd';
const VIDEO_PATH = 'C:\\Users\\RAJESH\\.gemini\\antigravity\\brain\\8fe536c0-3b0a-440c-b787-10f7576e36dd\\.user_uploaded\\media_1793954097953_f1f1f6ef.mp4';

async function extractFrames() {
  const tempUserDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome_vid_'));
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    userDataDir: tempUserDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--remote-debugging-port=0']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="margin:0; background:black; display:flex; justify-content:center; align-items:center; height:100vh;">
        <video id="vid" src="file://${VIDEO_PATH.replace(/\\/g, '/')}" style="max-width:100%; max-height:100%;"></video>
      </body>
    </html>
  `;

  await page.setContent(html);

  const duration = await page.evaluate(async () => {
    const vid = document.getElementById('vid');
    await new Promise((resolve) => {
      if (vid.readyState >= 1) resolve();
      else vid.onloadedmetadata = () => resolve();
    });
    return vid.duration;
  });

  console.log('Video duration:', duration);

  // Capture 6 frames across duration
  const timestamps = [0, duration * 0.2, duration * 0.4, duration * 0.6, duration * 0.8, Math.max(0, duration - 0.5)];
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    await page.evaluate(async (time) => {
      const vid = document.getElementById('vid');
      vid.currentTime = time;
      await new Promise(r => {
        vid.onseeked = () => r();
        setTimeout(r, 500);
      });
    }, t);
    await new Promise(r => setTimeout(r, 400));
    const outPath = path.join(ARTIFACT_DIR, `video_frame_${i}.png`);
    await page.screenshot({ path: outPath });
    console.log(`Saved frame ${i} at ${t.toFixed(1)}s -> ${outPath}`);
  }

  await browser.close();
  try { fs.rmSync(tempUserDir, { recursive: true, force: true }); } catch {}
}

extractFrames().catch(console.error);
