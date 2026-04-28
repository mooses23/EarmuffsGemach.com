# Baby Banz Earmuffs Gemach

## Overview

This full-stack web application manages a global network of gemachs (lending libraries) for Baby Banz noise-cancelling earmuffs. Its primary purpose is to protect infants' hearing by facilitating the lending process, managing deposits, and providing administrative tools. The platform supports three user types: public users (borrowers, new gemach applicants), operators (manage specific gemach locations), and admins (system-wide oversight). The project aims to expand the availability of ear protection for infants worldwide by streamlining the lending and management process.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui (Radix UI)
- **Styling**: Tailwind CSS
- **Build Tool**: Vite

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: REST endpoints (`/api/`)
- **Authentication**: Passport.js (local strategy, session-based via express-session)
- **Session Storage**: PostgreSQL via connect-pg-simple
- **Modular Structure**: Specialized services for routes, data access, authentication, payment processing, email, and audit trails.

### Data Layer
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (via Neon serverless driver)
- **Schema**: Shared between client/server (`shared/schema.ts`)
- **Key Entities**: Users, Regions, CityCategories, Locations, Transactions, Payments, PaymentMethods, GemachApplications, Contacts.

### Authentication & Authorization
- **Role-Based Access Control**: User, operator, admin roles.
- **Operator PIN-based Login**: Operators authenticate with location code + PIN, allowing session-based access to their specific location.
- **Invite Code System**: For user registration.

### Payment Processing
- **Unified Deposit System**: $20 refundable deposit model with role-based access control for payment confirmation.
- **Multiple Payment Methods**: Supports Stripe, PayPal, cash, etc.
- **Pay Later System**: Card verification without immediate charge via Stripe SetupIntents, charging only if items are damaged or not returned. This minimizes transaction fees for successful returns.
- **Refund System**: Role-based access control for processing full or partial refunds, aligned with deposit system.

### Operator Dashboard Features
- **Inventory Management**: Color-based tracking, low stock alerts, add stock functionality.
- **Lend Wizard**: Guided process for lending, including color selection, borrower info, and deposit handling.
- **Self-Deposit Acceptance**: Operators can accept self-deposits from customers who added their own card details. "Accept & Lend" button confirms lending without charging; status transitions from CARD_SETUP_COMPLETE to APPROVED.
- **Return Wizard**: Guided process for returns, including borrower selection and refund options (full/partial, damage deductions). Charge Card option is disabled if card setup was not completed (CARD_SETUP_PENDING status).

### Internationalization (i18n)
- **Languages**: English and Hebrew support (704 translation keys in both languages).
- **Translation System**: Custom hook-based (React Context) with translations in `client/src/lib/translations.ts`.
- **Usage**: Import `useLanguage` from `@/hooks/use-language` and use the `t()` function: `const { t, language, isHebrew } = useLanguage();`
- **RTL Support**: Automatic document direction switching when toggling to Hebrew.
- **Date Localization**: Use `formatLocalizedDate(date, language)` helper in operator dashboard for locale-aware date formatting.
- **Persistence**: Language preference saved in localStorage.
- **Verification Tool**: `scripts/verify-translations.js` - Automated script to verify translation key parity between English and Hebrew sections. Run with `node scripts/verify-translations.js` to check for missing translations.
- **Inbox Threading Test**: `scripts/test-inbox-threading.ts` - Regression test for the threaded admin inbox (subject normalization, list collapsing, atomic per-thread mutations, AI form-thread sibling selection). Run with `npx tsx scripts/test-inbox-threading.ts`. Exits non-zero on failure.
- **Playwright e2e Suite**: `e2e/inbox-threading.spec.ts` and `e2e/inbox-filters.spec.ts` (config: `playwright.config.ts`) - Persistent UI regression tests that (a) verify the inbox collapses 3 sibling form messages into one row with a "{N} messages" pill, the transcript renders all messages, and marking the thread as spam moves every sibling atomically; and (b) verify thread-level search matches text from any message in the thread (not just the latest) while preserving the full message-count badge, and that the "Needs reply" / "Replied" filters correctly include/exclude un-replied threads. Run with `npx playwright test`. Uses system chromium; override with `PLAYWRIGHT_CHROMIUM_PATH` env var.
- **All Pages Covered**: Homepage, Rules, Contact, Apply, Self-Deposit, Admin Dashboard, Admin Locations, Admin Transactions, Admin Applications, Admin Emails, Admin Messages, Admin Payment Methods, Admin Payment Confirmations, Admin Payment Status Monitor, Operator Dashboard, Operator Login, Operator Deposit Dashboard.

### Visual Design System (Glassmorphism Theme)
- **Theme**: Dark glassmorphism with translucent panels and blur effects
- **Background**: Slate gradient (#0F172A to #1E293B)
- **Primary Color**: Ocean Blue (#3B82F6)
- **Accent Color**: Coral Orange (#F97316) for CTAs
- **Glass Effects**: Utility classes in `index.css` - `.glass-panel`, `.glass-card`, `.btn-glass-primary`, etc.
- **Ambient Effects**: Floating glow orbs (`.glow-orb-blue`, `.glow-orb-teal`, `.glow-orb-accent`)
- **Typography**: White (#F8FAFC) for headings, slate-300/400 for body text on dark backgrounds
- **Key Components Styled**: Header, homepage hero, location search, how-it-works cards, CTA section, dedication banner

### Contact Actions System
- **Component**: `client/src/components/ui/contact-actions.tsx` provides `ContactActions` (dark/glass theme, compact icon-only variant) and `ContactActionsLight` (light theme with labels)
- **Features**: Clickable phone numbers (`tel:` links), SMS with pre-filled message (`sms:` links), WhatsApp with pre-filled message (`wa.me` links)
- **Pre-filled Message**: Localized borrowing inquiry message with location name placeholder
- **Integration Points**: Location cards (hierarchical search + legacy cards), self-deposit borrower form (both form view and payment view)
- **Navigation Safety**: Cards use programmatic navigation via `useLocation` hook with click delegation to prevent contact button clicks from triggering card navigation
- **i18n**: Translation keys `callAction`, `smsAction`, `whatsappAction`, `prefillBorrowMessage`, `contactLocation`, `contactLocationPrompt`, `contactLabel2` in both EN and HE

## External Dependencies

### Payment Integrations
- **Stripe**: `@stripe/stripe-js`, `@stripe/react-stripe-js` (frontend); native Stripe SDK (backend).
- **PayPal**: `@paypal/paypal-server-sdk`.

### Database
- **PostgreSQL**: `pg` Pool driver.
- **Drizzle ORM**: For database interactions.

### Email
- Email notification service structure exists (`server/email-notifications.ts`), ready for SMTP/email service integration.

### Admin Gmail Inbox & AI Responses
- **Gmail API**: `server/gmail-client.ts` for reading and sending emails (supports Replit connector and Vercel OAuth). Header values are CRLF-sanitized and recipient emails validated to prevent header injection.
- **OpenAI**: `server/openai-client.ts` returns `{ draft, classification, needsHumanReview, reviewReason }` using a built-in PLAYBOOK + DB context (sender → application/location). Inbox shows a "Human review recommended" banner when escalation triggers fire.
- Unified inbox at `/admin/inbox` merges Gmail + web-form contact messages.

### Operator Onboarding
- `POST /api/admin/locations/:id/send-welcome` and `POST /api/admin/locations/send-welcome-all` send a plaintext setup email (location code + default PIN `1234` + dashboard URL + "change PIN" instructions) via `sendOperatorWelcomeEmail` in `server/email-notifications.ts`.
- Dashboard URL prefers `APP_URL`/`SITE_URL` env, falls back to request host.
- Admin UI: per-row "Send setup email" + bulk "Send setup email to all" in PIN Management card on `/admin/locations`.
- `/operator/login` now renders `OperatorLogin` (was previously redirecting to `/auth`).