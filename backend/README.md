# DEVHUB Backend Foundation

This is the backend for the DEVHUB project, built using Node.js, Express, PostgreSQL, and Prisma ORM.

## Setup Instructions

1. **Install Dependencies**
   Make sure you are in the `backend` directory, then run:
   ```bash
   npm install
   ```

2. **Environment Variables**
   Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and configure your `DATABASE_URL` with your local PostgreSQL credentials.

3. **Database Setup**
   Ensure you have PostgreSQL installed and running. Create a database named `devhub` (or update your `.env` to match your DB name).

4. **Run Migrations**
   This command applies the Prisma schema to the database, creating all tables:
   ```bash
   npx prisma migrate dev --name init
   ```

5. **Generate Prisma Client**
   Run this to generate the database client code:
   ```bash
   npx prisma generate
   ```

6. **Start the Server**
   Start the backend in development mode:
   ```bash
   npm run dev
   ```

7. **Verify Health**
   Navigate to `http://localhost:3001/api/health` to confirm the backend is running.
