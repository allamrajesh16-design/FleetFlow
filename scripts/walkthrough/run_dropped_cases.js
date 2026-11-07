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
  const adminId = adminLogin.data?.user?.id;

  // A2.11b: Admin tries to change their own role to CUSTOMER
  const rSelfRole = await apiCall('PATCH', `/api/users/${adminId}/`, token, { role: 'CUSTOMER' });
  console.log('A2.11b Admin change self role:', rSelfRole.status, rSelfRole.data);

  // A4.1b: Bus without minimum passengers
  const rBusNoMin = await apiCall('POST', '/api/vehicles/', token, {
    registration_number: 'WT AP 05 WT NOMIN',
    brand: 'Volvo',
    model: 'B11R',
    vehicle_type: 'BUS',
    seating_capacity: 40,
    rate_per_km: 45
  });
  console.log('A4.1b Bus without min passengers:', rBusNoMin.status, rBusNoMin.data);

  // A4.2b: Negative rate
  const rNegRate = await apiCall('POST', '/api/vehicles/', token, {
    registration_number: 'WT AP 05 WT NEGRATE',
    brand: 'Toyota',
    model: 'Innova',
    vehicle_type: 'CAR',
    seating_capacity: 6,
    rate_per_km: -15
  });
  console.log('A4.2b Negative rate:', rNegRate.status, rNegRate.data);

  // A4.2c: Bus with min passengers 40 and seats 40
  const rBusMinEqualsSeats = await apiCall('POST', '/api/vehicles/', token, {
    registration_number: 'WT AP 05 WT MINSEATS',
    brand: 'Volvo',
    model: 'B11R',
    vehicle_type: 'BUS',
    seating_capacity: 40,
    min_passengers: 40,
    rate_per_km: 45
  });
  console.log('A4.2c Bus min 40 with 40 seats:', rBusMinEqualsSeats.status, rBusMinEqualsSeats.data);
}

run();

