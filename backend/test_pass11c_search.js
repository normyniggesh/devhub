require('dotenv').config();
const prisma = require('./src/db');
const supertest = require('supertest');
const app = require('./src/app');

async function createAuthCookie(user) {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    return `devhub_auth_token=${token}`;
}

async function runTests() {
    console.log('--- Starting Pass 11C Search Tests ---');

    await prisma.file.deleteMany({ where: { name: { in: ['PersonalFile11C.txt', 'TeamFile11C.txt'] } } });
    await prisma.teamMember.deleteMany({ where: { user: { email: { in: ['owner11c@example.com', 'teammember11c@example.com', 'stranger11c@example.com'] } } } });
    await prisma.team.deleteMany({ where: { name: 'Team11C' } });
    await prisma.user.deleteMany({ where: { email: { in: ['owner11c@example.com', 'teammember11c@example.com', 'stranger11c@example.com'] } } });
    // Create users
    const owner = await prisma.user.create({ data: { name: 'Owner11C', email: 'owner11c@example.com', passwordHash: 'hash' } });
    const teamMember = await prisma.user.create({ data: { name: 'TeamMember11C', email: 'teammember11c@example.com', passwordHash: 'hash' } });
    const stranger = await prisma.user.create({ data: { name: 'Stranger11C', email: 'stranger11c@example.com', passwordHash: 'hash' } });

    // Create Team
    const team = await prisma.team.create({ data: { name: 'Team11C', createdById: owner.id } });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: owner.id, role: 'Leader' } });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: teamMember.id, role: 'Member' } });

    // Create Personal File
    await prisma.file.create({
        data: {
            name: 'PersonalFile11C.txt',
            type: 'FILE',
            size: 100,
            storagePath: 'fake/path/personal',
            storageScope: 'PERSONAL',
            uploaderId: owner.id,
        }
    });

    // Create Team File
    await prisma.file.create({
        data: {
            name: 'TeamFile11C.txt',
            type: 'FILE',
            size: 100,
            storagePath: 'fake/path/team',
            storageScope: 'TEAM',
            uploaderId: owner.id,
            teamId: team.id
        }
    });

    const ownerCookie = await createAuthCookie(owner);
    const memberCookie = await createAuthCookie(teamMember);
    const strangerCookie = await createAuthCookie(stranger);

    try {
        console.log('1. Owner searching for their personal file');
        let res = await supertest(app).get('/api/search?q=PersonalFile11C').set('Cookie', ownerCookie);
        if (res.status !== 200 || !res.body.results.files.some(f => f.name === 'PersonalFile11C.txt')) {
            throw new Error('Owner could not find their personal file');
        }
        console.log('✅ Passed');

        console.log('2. Stranger searching for owner personal file (should not see)');
        res = await supertest(app).get('/api/search?q=PersonalFile11C').set('Cookie', strangerCookie);
        if (res.status !== 200 || res.body.results.files.some(f => f.name === 'PersonalFile11C.txt')) {
            throw new Error('Stranger saw a personal file they do not own');
        }
        console.log('✅ Passed');

        console.log('3. Owner searching for team file');
        res = await supertest(app).get('/api/search?q=TeamFile11C').set('Cookie', ownerCookie);
        if (res.status !== 200 || !res.body.results.files.some(f => f.name === 'TeamFile11C.txt')) {
            throw new Error('Owner could not find team file');
        }
        console.log('✅ Passed');

        console.log('4. Team member searching for team file');
        res = await supertest(app).get('/api/search?q=TeamFile11C').set('Cookie', memberCookie);
        if (res.status !== 200 || !res.body.results.files.some(f => f.name === 'TeamFile11C.txt')) {
            throw new Error('Team member could not find team file');
        }
        console.log('✅ Passed');

        console.log('5. Stranger searching for team file (should not see)');
        res = await supertest(app).get('/api/search?q=TeamFile11C').set('Cookie', strangerCookie);
        if (res.status !== 200 || res.body.results.files.some(f => f.name === 'TeamFile11C.txt')) {
            throw new Error('Stranger saw a team file they are not a part of');
        }
        console.log('✅ Passed');

        console.log('All tests passed!');

    } finally {
        await prisma.file.deleteMany({ where: { name: { in: ['PersonalFile11C.txt', 'TeamFile11C.txt'] } } });
        await prisma.teamMember.deleteMany({ where: { teamId: team.id } });
        await prisma.team.delete({ where: { id: team.id } });
        await prisma.user.deleteMany({ where: { id: { in: [owner.id, teamMember.id, stranger.id] } } });
        await prisma.$disconnect();
    }
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
