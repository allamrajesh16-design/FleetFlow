const http = require('http');

function apiCall(method, urlPath, token, data) {
  return new Promise((resolve, reject) => {
    const postData = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (postData) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8000,
      path: urlPath,
      method: method,
      headers: headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, text: body }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  const adminLogin = await apiCall('POST', '/api/auth/login/', null, {
    identifier: 'wt.admin+1@gmail.com',
    password: process.env.WT_PASSWORD || 'Walkthrough@123'
  });
  const token = adminLogin.data?.access;

  // A9.1 Summary cards vs database
  const paySum = await apiCall('GET', '/api/payments/summary/', token);
  console.log('A9.1 Summary API:', paySum.status, paySum.data);

  // A9.2 Payments list
  const payList = await apiCall('GET', '/api/payments/', token);
  const rows = payList.data?.results || payList.data || [];
  console.log('A9.2 Payments count:', rows.length);

  // Find or create PAYMENT_INITIATED
  let pInit = rows.find(p => p.status === 'PAYMENT_INITIATED');
  console.log('A9.3 Found PAYMENT_INITIATED:', pInit?.id, pInit?.transaction_reference);

  // Test A9.8: refund on UNPAID payment blocked
  let pUnpaid = rows.find(p => p.status === 'UNPAID');
  if (pUnpaid) {
    const rRefUnpaid = await apiCall('POST', `/api/payments/${pUnpaid.id}/refund/`, token, {});
    console.log('A9.8 Refund on UNPAID:', rRefUnpaid.status, rRefUnpaid.data);
  }

  // Test A9.10: Fleet Manager refund blocked
  const fmMgrLogin = await apiCall('POST', '/api/auth/login/', null, {
    identifier: 'wt.manager+1@gmail.com',
    password: process.env.WT_PASSWORD || 'Walkthrough@123'
  });
  const fmToken = fmMgrLogin.data?.access;
  const pPaid = rows.find(p => p.status === 'PAID');
  if (pPaid) {
    const fmRefund = await apiCall('POST', `/api/payments/${pPaid.id}/refund/`, fmToken, {});
    console.log('A9.10 FM Refund blocked:', fmRefund.status, fmRefund.data);
  }
}

run();

