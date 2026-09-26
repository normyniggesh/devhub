const prisma = require('./src/db');

async function cleanup() {
  await prisma.user.delete({ where: { email: 'smoke@example.com' } });
  console.log('Cleanup done');
}
cleanup().catch(console.error).finally(() => process.exit(0));
