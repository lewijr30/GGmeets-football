# GGmeets — Addis Ababa Football Meetup

A React + TypeScript + Vite web application for discovering, booking, and managing pickup football matches across Addis Ababa (Bole, Meskel Square, Sarbet, and CMC).

## Features

- **Match Discovery & Filtering**: Browse upcoming 5-a-side, 7-a-side, and Full Field (11v11) matches with real-time spot availability and location/pitch search.
- **Mobile Banking Spot Registration**: Pay via **Telebirr** or **CBE / CBE Birr**, one-tap copy account numbers, and upload transfer receipt screenshots for verification.
- **Digital Match Passes**: Track registration status (`Verified Pass`, `Admin Verification Pending`, `Payment Rejected`) and inspect submitted payment receipts.
- **Password-Locked Host Admin (`/admin/login`)**: Server-side password lock (`scrypt` hashed or set via `ADMIN_PASSWORD`) protecting payment receipt verification, match publishing, and match management.
- **Player Profile**: Customize player name, phone number, preferred pitch position, Addis Ababa subcity, and avatar photo.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Optional: Copy `.env.example` to `.env` to configure your Supabase project credentials.
3. Run the development server on port 3000:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```
