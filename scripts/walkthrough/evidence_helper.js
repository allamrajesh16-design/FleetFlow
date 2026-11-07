const fs = require('fs');
const path = require('path');

const EVIDENCE_DIR = path.resolve(__dirname, 'evidence');

function writeEvidence(caseId, data) {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
  const filePath = path.join(EVIDENCE_DIR, `${caseId}.json`);
  const record = {
    case_id: caseId,
    timestamp: new Date().toISOString(),
    ...data
  };
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
  console.log(`[EVIDENCE] Saved ${caseId} to ${filePath}`);
}

async function captureEvidence(page, {
  caseId,
  channel = 'UI',
  actions = [],
  targetSelector,
  fullScreenshotPath,
  cropScreenshotPath,
  beforeDb = null,
  afterDb = null,
  apiStatus = null,
  apiBody = null,
  status = 'SOLID',
  notes = ''
}) {
  let visibleText = null;
  if (targetSelector && page) {
    try {
      await page.waitForSelector(targetSelector, { timeout: 4000 });
      visibleText = await page.$eval(targetSelector, el => (el.innerText || el.textContent || '').trim());
      
      // Save element crop screenshot if requested
      if (cropScreenshotPath) {
        const el = await page.$(targetSelector);
        if (el) {
          const dir = path.dirname(cropScreenshotPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          await el.screenshot({ path: cropScreenshotPath });
        }
      }
    } catch (e) {
      console.warn(`[WARN] Could not get text/crop for selector ${targetSelector} in ${caseId}: ${e.message}`);
    }
  }

  if (fullScreenshotPath && page) {
    const dir = path.dirname(fullScreenshotPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: fullScreenshotPath });
  }

  writeEvidence(caseId, {
    channel,
    actions,
    target_selector: targetSelector,
    visible_text: visibleText,
    api_status: apiStatus,
    api_body: apiBody,
    db_before: beforeDb,
    db_after: afterDb,
    screenshot_full: fullScreenshotPath ? path.relative(path.resolve(__dirname, '../../'), fullScreenshotPath).replace(/\\/g, '/') : null,
    screenshot_crop: cropScreenshotPath ? path.relative(path.resolve(__dirname, '../../'), cropScreenshotPath).replace(/\\/g, '/') : null,
    status,
    notes
  });
}

module.exports = {
  writeEvidence,
  captureEvidence
};

