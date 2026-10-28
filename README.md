# GGmeets — Addis Ababa Football Meetup

A React + TypeScript + Vite web application for discovering, booking, and managing pickup football matches across Addis Ababa (Bole, Meskel Square, Sarbet, and CMC).

## Features

- **Match Discovery & Filtering**: Browse upcoming 5-a-side, 7-a-side, and Full Field (11v11) matches with real-time spot availability and location/pitch search.
- **Mobile Banking Spot Registration**: Pay via **Telebirr** or **CBE / CBE Birr**, one-tap copy account numbers, and upload transfer receipt screenshots for verification.
- **Digital Match Passes**: Track registration status (`Verified Pass`, `Admin Verification Pending`, `Payment Rejected`) and inspect submitted payment receipts.
- **Host Admin Portal (`/admin/login`)**: Protected host login (via Supabase Auth or configured admin env credentials) to review player transfer receipts, approve/reject bookings, publish new pickup matches, and remove match listings.
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
