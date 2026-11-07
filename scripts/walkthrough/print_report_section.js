const fs = require('fs');
const path = require('path');

const EVIDENCE_DIR = path.resolve(__dirname, 'evidence');

function printPrefixReport(prefix, title) {
  if (!fs.existsSync(EVIDENCE_DIR)) return;
  const files = fs.readdirSync(EVIDENCE_DIR).filter(f => f.startsWith(prefix) && f.endsWith('.json'));
  const records = files.map(f => JSON.parse(fs.readFileSync(path.join(EVIDENCE_DIR, f), 'utf-8')));
  records.sort((a, b) => a.case_id.localeCompare(b.case_id, undefined, { numeric: true, sensitivity: 'base' }));

  let pass = 0, fail = 0, partial = 0;
  for (const r of records) {
    let isPass = true;
    if (r.assertions && Array.isArray(r.assertions) && r.assertions.length > 0) {
      for (const a of r.assertions) {
        if (!a.passed) { isPass = false; break; }
      }
      r.computed_result = isPass ? 'PASS' : 'FAIL';
    } else {
      r.computed_result = r.status === 'SOLID' ? 'PASS' : (r.status || 'FAIL');
    }
    if (r.computed_result === 'PASS') pass++;
    else if (r.computed_result === 'FAIL') fail++;
    else partial++;
  }

  console.log(`\n### ${title} (${records.length} Recorded: ${pass} PASS, ${partial} PARTIAL, ${fail} FAIL)\n`);
  console.log('| ID | Channel | Input / Actions | Assertion (Condition & Evaluated Values) | Actual UI Text / API Body | DB Before -> After | Screenshot | Result |');
  console.log('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

  for (const r of records) {
    const id = r.case_id;
    const channel = r.channel || 'UI';
    const actions = (r.actions || []).join('; ') || '-';
    let assertionStr = '-';
    if (r.assertions && Array.isArray(r.assertions) && r.assertions.length > 0) {
      assertionStr = r.assertions.map(a => `${a.name}: ${a.condition} (${a.passed ? 'TRUE' : 'FALSE'}${a.details ? ' - ' + a.details : ''})`).join('; ');
    } else if (r.assertion) {
      assertionStr = r.assertion;
    }
    const actualText = r.visible_text ? `"${r.visible_text.replace(/\n/g, ' ').slice(0, 150)}"` : (r.api_body ? JSON.stringify(r.api_body).slice(0, 150) : '-');
    let dbStr = '-';
    if (r.db_before !== null && r.db_before !== undefined && r.db_after !== null && r.db_after !== undefined) {
      dbStr = `${JSON.stringify(r.db_before)} -> ${JSON.stringify(r.db_after)}`;
    }
    const scr = r.screenshot_full ? `[\`${path.basename(r.screenshot_full)}\`](file:///${r.screenshot_full})` : '-';
    console.log(`| **${id}** | ${channel} | ${actions} | ${assertionStr} | ${actualText} | ${dbStr} | ${scr} | **${r.computed_result}** |`);
  }
}

printPrefixReport('A9.', 'A9 Payments Walkthrough Report');
printPrefixReport('S1.', 'Story S1 End-to-End Real Flow Walkthrough Report');

