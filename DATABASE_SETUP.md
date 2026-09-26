# DEVHUB Database Setup Guide

Welcome! This guide explains how to get the DEVHUB local PostgreSQL database up and running for development.

## 1. Install PostgreSQL
If you haven't already, download and install PostgreSQL for your operating system:
- **Windows / Mac**: Download the installer from the official site (https://www.postgresql.org/download/).
- **Linux**: Use your package manager (e.g., `sudo apt install postgresql`).

*Note: Write down the password you set for the default `postgres` user during installation!*

## 2. Create the Database
Once PostgreSQL is installed and running, you need to create a database for the project.
You can use a tool like **pgAdmin** (included with the installer) or the command line (`psql`).

Using command line:
```bash
psql -U postgres
# Enter your password when prompted
CREATE DATABASE devhub;
\q
```

## 3. Configure the Project
Navigate to the `backend/` folder in this repository.
Create a file named `.env` by copying the `.env.example` file:
```bash
cp .env.example .env
```
Open the `.env` file and replace the `DATABASE_URL` placeholder with your actual connection string. It usually looks like this:
```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/devhub?schema=public"
```

## 4. Run Migrations
Migrations take our Prisma schema and turn it into actual SQL tables in your database.
From the `backend/` directory, run:
```bash
npm install
npx prisma migrate dev --name init
```
*This command will create all 19 entities defined in the DEVHUB data architecture. It will NOT insert any fake data.*

## 5. Verify the Client
Generate the Prisma Client so your code can communicate with the database:
```bash
npx prisma generate
```

## 6. Start the Backend
```bash
npm run dev
```
Open your browser and visit `http://localhost:3001/api/health` to verify that it replies with `{"status":"ok"}`.

You are now ready to develop!
