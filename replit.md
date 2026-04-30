# Baby Banz Earmuffs Gemach

## Overview

This full-stack web application facilitates a global network of gemachs (lending libraries) for Baby Banz noise-cancelling earmuffs. Its core mission is to protect infant hearing by streamlining the lending process, managing refundable deposits, and providing administrative tools. The platform supports public users (borrowers, applicants), operators (managing specific gemach locations), and system administrators. The project aims to significantly expand the availability of infant ear protection globally through efficient management and accessibility.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui (Radix UI)
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Internationalization**: English and Hebrew support with automatic RTL switching, custom hook-based translation system.
- **Visual Design**: Dark glassmorphism theme with translucent panels, blur effects, slate gradient background, Ocean Blue primary color, and Coral Orange accents. Custom utility classes for glass effects and ambient glow orbs.

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: REST endpoints (`/api/`)
- **Authentication**: Passport.js (local strategy, session-based via `express-session`), role-based access control (User, Operator, Admin). Operator PIN-based login for location-specific access.
- **Session Storage**: PostgreSQL via `connect-pg-simple`.
- **Modular Structure**: Services for routes, data access, authentication, payment, email, and audit trails.

### Data Layer
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (via Neon serverless driver)
- **Schema**: Shared between client/server. Key entities include Users, Regions, Locations, Transactions, Payments, GemachApplications, etc.

### Core Features
- **Unified Deposit System**: $20 refundable deposit, supporting multiple payment methods (Stripe, PayPal, cash).
- **Pay Later System**: Card verification via Stripe SetupIntents, with charges only for damaged or unreturned items.
- **Refund System**: Role-based access control for full or partial refunds.
- **Operator Dashboard**: Inventory management (color-based tracking, low stock alerts), Lend Wizard, Return Wizard (with damage deductions), self-deposit acceptance, cash deposit recording.
- **Admin Dashboard**: Unified inbox for Gmail and web-form messages, AI-powered response drafting and classification with human review prompts, message send history logging.
- **Operator Onboarding**: Automated plaintext setup emails for operators, including location code and default PIN.
- **Contact Actions System**: Component for clickable phone, SMS, and WhatsApp links with pre-filled, localized messages.

## External Dependencies

### Payment Integrations
- **Stripe**: For card payments, setup intents, and refunds.
- **PayPal**: For PayPal transactions.

### Database
- **PostgreSQL**: Primary database.
- **Drizzle ORM**: For database interactions.

### Email
- **Gmail API**: Used by the admin inbox for reading and sending emails.
- **SMTP/Email Service**: Backend is structured to integrate with an email service for sending notifications and operator welcome emails.

### AI Services
- **OpenAI**: Utilized for AI-powered response drafting, message classification, and human review recommendations in the admin inbox. Leverages a built-in playbook and database context.