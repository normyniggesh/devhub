require('dotenv').config();
const fs = require('fs');
const prisma = require('./src/db');
const authController = require('./src/controllers/auth');
const adminCodesController = require('./src/controllers/adminCodes');

async function run() {
  console.log('--- TESTING REGISTRATION CODES ---');
  
  // Create a mock req and res for Admin Codes
  const mockAdminUser = await prisma.user.findFirst({ where: { role: 'Admin' } });
  if (!mockAdminUser) throw new Error('No admin user found');
  
  console.log('1. Admin creating a code...');
  let createdCode = null;
  const reqCreate = { userId: mockAdminUser.id, body: { name: 'E2E Test Code', code: 'E2E2026' } };
  const resCreate = {
    status: (code) => resCreate,
    json: (data) => {
      console.log('Create Code Result:', data);
      if (data.code) createdCode = data.code;
    }
  };
  await adminCodesController.createCode(reqCreate, resCreate);
  
  if (!createdCode) throw new Error('Code was not created');
  
  console.log('2. Testing User Registration...');
  let newUser = null;
  const reqReg = {
    body: {
      name: 'E2E User',
      email: 'e2e_' + Date.now() + '@test.com',
      password: 'password123',
      registrationCode: 'E2E2026'
    }
  };
  const resReg = {
    status: (code) => resReg,
    json: (data) => {
      console.log('Register Result:', data);
      if (data.success) newUser = { email: data.email };
    }
  };
  await authController.register(reqReg, resReg);
  
  if (!newUser) throw new Error('User was not registered');
  
  console.log('3. Validating linking...');
  const userInDb = await prisma.user.findUnique({
    where: { email: newUser.email },
    include: { registrationCode: true }
  });
  console.log('Registered via:', userInDb.registrationCode?.name);
  if (!userInDb.registrationCode) throw new Error('Registration code not linked to user');
  
  console.log('4. Legacy user login (should work)...');
  let loginSuccess = false;
  const reqLogin = { body: { email: 'admin@devhub.test', password: '123456' } };
  const resLogin = {
    status: (code) => resLogin,
    cookie: () => resLogin,
    json: (data) => {
      console.log('Admin Login Result Data User:', !!data.user);
      loginSuccess = !!data.user;
    }
  };
  await authController.login(reqLogin, resLogin);
  if (!loginSuccess) throw new Error('Legacy login failed');
  
  console.log('ALL TESTS PASSED');
  process.exit(0);
}

run().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
