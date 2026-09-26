const http = require('http');

async function request(method, path, data = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (cookie) {
      options.headers['Cookie'] = cookie;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let setCookie = res.headers['set-cookie'];
        if (setCookie) setCookie = setCookie.map(c => c.split(';')[0]).join('; ');
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body), cookie: setCookie || cookie });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, cookie: setCookie || cookie });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTest() {
  let cookie = null;

  try {
    // 1. Auth Register
    console.log('Testing Registration...');
    const regRes = await request('POST', '/api/auth/register', { name: 'Smoke Test', email: 'smoke@example.com', password: 'password123' });
    console.log('Register:', regRes.status, regRes.data.success);

    // 2. Auth Login
    console.log('Testing Login...');
    const loginRes = await request('POST', '/api/auth/login', { email: 'smoke@example.com', password: 'password123' });
    cookie = loginRes.cookie;
    console.log('Login:', loginRes.status, loginRes.data.success);

    if (!cookie) {
      console.log('No cookie received. Exiting.');
      return;
    }

    // 3. Project Create
    console.log('Testing Project Creation...');
    const projRes = await request('POST', '/api/projects', { name: 'Test Project', description: 'desc', status: 'Active' }, cookie);
    const projectId = projRes.data.project.id;
    console.log('Project:', projRes.status, !!projectId);

    // 4. Task Create
    console.log('Testing Task Creation...');
    const taskRes = await request('POST', '/api/tasks', { projectId, title: 'Test Task', status: 'To Do', priority: 'High' }, cookie);
    const taskId = taskRes.data.task.id;
    console.log('Task:', taskRes.status, !!taskId);

    // 5. Cleanup
    console.log('Cleaning up Task...');
    await request('DELETE', `/api/tasks/${taskId}`, null, cookie);
    
    console.log('Cleaning up Project...');
    await request('DELETE', `/api/projects/${projectId}`, null, cookie);

    console.log('Deleting Test User (simulated)...');
    // Using prisma directly to clean up user since no API exists
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.user.delete({ where: { email: 'smoke@example.com' } });
    await prisma.$disconnect();
    
    console.log('Smoke tests completed successfully.');
  } catch (error) {
    console.error('Smoke test failed:', error);
  }
}

runTest();
