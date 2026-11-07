const fs = require('fs');
const path = require('path');
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

async function check() {
  const adminLogin = await apiCall('POST', '/api/auth/login/', null, {
    identifier: 'wt.admin+1@gmail.com',
    password: process.env.WT_PASSWORD || 'Walkthrough@123'
  });
  const token = adminLogin.data?.access;
  console.log('Admin login status:', adminLogin.status, 'Has token:', !!token);

  const sumRes = await apiCall('GET', '/api/payments/summary/', token);
  console.log('Payments summary:', sumRes.status, sumRes.data);

  const payList = await apiCall('GET', '/api/payments/', token);
  console.log('Payments list status:', payList.status, 'Total items:', payList.data?.count || (Array.isArray(payList.data) ? payList.data.length : payList.data?.results?.length));
}

check().catch(console.error);

