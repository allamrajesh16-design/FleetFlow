const fs = require('fs');
const path = require('path');

const EVIDENCE_DIR = path.resolve(__dirname, 'evidence');

function generateReport() {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    console.log('No evidence directory found.');
    return;
  }

  const files = fs.readdirSync(EVIDENCE_DIR).filter(f => f.endsWith('.json'));
  const records = [];

  for (const f of files) {
    const raw = fs.readFileSync(path.join(EVIDENCE_DIR, f), 'utf-8');
    records.push(JSON.parse(raw));
  }

  // Sort by case_id
  records.sort((a, b) => a.case_id.localeCompare(b.case_id, undefined, { numeric: true, sensitivity: 'base' }));

  let passCount = 0;
  let failCount = 0;
  let partialCount = 0;
  let notRunCount = 0;

  for (const r of records) {
    // Assertions-based evaluation
    let isPass = true;
    if (r.assertions && Array.isArray(r.assertions) && r.assertions.length > 0) {
      for (const a of r.assertions) {
        if (!a.passed) {
          isPass = false;
          break;
        }
      }
      r.computed_result = isPass ? 'PASS' : 'FAIL';
    } else {
      // Legacy or missing assertions
      r.computed_result = r.status === 'SOLID' ? 'PASS' : (r.status || 'FAIL');
    }

    if (r.computed_result === 'PASS') passCount++;
    else if (r.computed_result === 'FAIL') failCount++;
    else if (r.computed_result === 'PARTIAL') partialCount++;
    else notRunCount++;
  }

  console.log(`\n### SUMMARY TOTALS: ${records.length} Recorded | ${passCount} PASS | ${partialCount} PARTIAL | ${failCount} FAIL | ${notRunCount} NOT RUN\n`);

  console.log('| ID | Channel | Input / Actions | Assertion (Checked Condition & Values) | Actual UI Text / API Body | DB Before -> After | Screenshot | Result |');
  console.log('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

  for (const r of records) {
    const id = r.case_id;
    const channel = r.channel || 'UI';
    const actions = (r.actions || []).join('; ') || '-';

    // Format assertions
    let assertionStr = '-';
    if (r.assertions && Array.isArray(r.assertions) && r.assertions.length > 0) {
      assertionStr = r.assertions.map(a => `${a.name}: ${a.condition} (${a.passed ? 'TRUE' : 'FALSE'}${a.details ? ' - ' + a.details : ''})`).join('; ');
    } else if (r.assertion) {
      assertionStr = r.assertion;
    }

    const actualText = r.visible_text ? `"${r.visible_text.replace(/\n/g, ' ')}"` : (r.api_body ? JSON.stringify(r.apiBody || r.api_body) : '-');

    let dbStr = '-';
    if (r.db_before !== null && r.db_before !== undefined && r.db_after !== null && r.db_after !== undefined) {
      dbStr = `${JSON.stringify(r.db_before)} -> ${JSON.stringify(r.db_after)}`;
    }

    const scr = r.screenshot_full ? `[\`${path.basename(r.screenshot_full)}\`](file:///${r.screenshot_full})` : '-';
    const res = r.computed_result || 'FAIL';

    console.log(`| **${id}** | ${channel} | ${actions} | ${assertionStr} | ${actualText} | ${dbStr} | ${scr} | **${res}** |`);
  }
}

generateReport();
