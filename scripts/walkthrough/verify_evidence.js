const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/guide/images');

// All cited screenshots across batches
const citedFiles = [
  'customer/bug_b_no_distance.png',
  'customer/bug_b_lowest_rate_estimate.png',
  'customer/booking_76_customer_view.png',
  'admin/a0_login_success.png',
  'admin/a1_dashboard_full.png',
  'admin/a1_dashboard_details.png',
  'admin/booking_76_admin_modal.png',
  'admin/a2_1_users_count.png',
  'admin/a2_2_search_wt.png',
  'admin/a2_3_filter_role.png',
  'admin/a2_4_add_customer.png',
  'admin/a2_5_bad_phone.png',
  'admin/a2_6_duplicate_user.png',
  'admin/a2_7_added_staff.png',
  'admin/a2_8_edit_user.png',
  'admin/a2_9_deactivate_user.png',
  'admin/a2_10_activate_user.png',
  'admin/a2_11_self_deactivate.png',
  'admin/a2_11b_self_role_blocked.png',
  'admin/a2_12_no_delete.png',
  'admin/a2_13_users_360px.png',
  'admin/a3_1_approvals_list.png',
  'admin/a3_2_approve_fm.png',
  'admin/a3_3_reject_driver.png',
  'admin/a3_4_approve_driver.png',
  'admin/a3_5_reapprove_blocked.png',
  'admin/a3_6_pending_dropped.png',
  'admin/a4_1_vehicles_added.png',
  'admin/a4_1b_bus_no_min.png',
  'admin/a4_2_invalid_vehicles.png',
  'admin/a4_2b_negative_rate.png',
  'admin/a4_2c_min_seats_rule.png',
  'admin/a4_3_edit_vehicle.png',
  'admin/a4_4_vehicle_status.png',
  'admin/a4_5_filter_vehicles.png',
  'admin/a4_6_delete_vehicle.png',
  'admin/a4_7_delete_ontrip_blocked.png',
  'admin/a4_8_vehicles_360px.png',
  'admin/a5_1_driver_added.png',
  'admin/a5_2_invalid_driver.png',
  'admin/a5_3_edit_driver.png',
  'admin/a5_3b_fm_assign_excluded.png',
  'admin/a5_4_filter_drivers.png',
  'admin/a5_5_delete_driver.png',
  'admin/a5_6_drivers_360px.png',
  'admin/a9_1_summary.png',
  'admin/a9_2_filters.png',
  'admin/a9_3_payment_initiated.png',
  'admin/a9_4_confirmed.png',
  'admin/a9_6_rejected_proof.png',
  'admin/a9_7_refunded.png',
  'admin/a9_9_pdf_receipt.png',
  'admin/a9_11_payments_360px.png'
];

console.log('='.repeat(100));
console.log('FLEETFLOW EVIDENCE MANIFEST & VERIFICATION AUDIT');
console.log('='.repeat(100));
console.log(
  'File Path'.padEnd(45) +
  'Exists'.padEnd(10) +
  'Size (KB)'.padEnd(12) +
  'Modified Time'.padEnd(25) +
  'SHA-256 (first 12)'
);
console.log('-'.repeat(100));

const hashes = new Map();
let warningsCount = 0;

for (const relPath of citedFiles) {
  const fullPath = path.join(SCREENSHOT_DIR, relPath);
  const exists = fs.existsSync(fullPath);
  if (!exists) {
    console.log(`${relPath.padEnd(45)}NO        -           -                        MISSING`);
    warningsCount++;
    continue;
  }
  const stat = fs.statSync(fullPath);
  const sizeKb = (stat.size / 1024).toFixed(1);
  const mtime = stat.mtime.toISOString().replace('T', ' ').slice(0, 19);
  const buf = fs.readFileSync(fullPath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const shortHash = hash.slice(0, 12);

  let warn = '';
  if (stat.size < 5120) {
    warn = ' [WARNING: < 5KB]';
    warningsCount++;
  }
  if (hashes.has(hash)) {
    warn += ` [DUPLICATE of ${hashes.get(hash)}]`;
    warningsCount++;
  } else {
    hashes.set(hash, relPath);
  }

  console.log(
    `${relPath.padEnd(45)}${'YES'.padEnd(10)}${sizeKb.padEnd(12)}${mtime.padEnd(25)}${shortHash}${warn}`
  );
}

console.log('='.repeat(100));
console.log(`Total Files Checked: ${citedFiles.length} | Warnings / Issues: ${warningsCount}`);
console.log('='.repeat(100));

