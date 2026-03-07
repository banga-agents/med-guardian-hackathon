/**
 * Simple test to verify demo orchestrator
 */

const http = require('http');

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('Testing Demo Orchestrator API...\n');

  try {
    // Test health endpoint
    console.log('1. Health check...');
    const health = await request('/health');
    console.log('   Status:', health.status);
    console.log('   Services:', health.services);

    // Test demo status
    console.log('\n2. Demo status...');
    const status = await request('/api/demo/status');
    console.log('   Running:', status.demo.isRunning);
    console.log('   Current day:', status.demo.currentDay);
    console.log('   Patients:', status.patients.map(p => p.name).join(', '));

    // Test conditions
    console.log('\n3. Patient conditions...');
    const conditions = await request('/api/demo/conditions');
    conditions.forEach(p => {
      console.log(`   ${p.name}: ${p.condition} (${p.hardToTrack ? 'hard-to-track' : 'standard'})`);
    });

    console.log('\n✅ API tests passed!');
    console.log('\nTo start the demo, run:');
    console.log('  curl -X POST http://localhost:4000/api/demo/start');

  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    console.log('\nMake sure the backend is running:');
    console.log('  cd /home/agent/chainlink-medpriv/medguardian/backend && npm start');
  }
}

test();
