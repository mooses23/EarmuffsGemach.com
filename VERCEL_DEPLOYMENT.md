# Complete Replit → Vercel Migration Guide

## Prerequisites

- Vercel account
- Neon PostgreSQL database (or any PostgreSQL provider)
- Stripe account (for payments)
- PayPal account (optional, for PayPal payments)

## Step 1: Create Production Database

### Using Neon (Recommended)

1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project called "GemachHub Production"
3. Copy the connection string (it looks like: `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`)
4. Save this as your `DATABASE_URL`

### Alternative: Use Vercel Postgres

1. In Vercel dashboard, go to Storage tab
2. Create new Postgres database
3. Copy the connection string

## Step 2: Configure Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables (use `.env.example` as reference):

**Critical Variables (MUST HAVE):**
- `DATABASE_URL` - Your Neon PostgreSQL connection string
- `SESSION_SECRET` - Generate with: `openssl rand -base64 32`
- `NODE_ENV` - Set to `production`

**Payment Variables (Required for full functionality):**
- `STRIPE_SECRET_KEY` - From Stripe dashboard
- `STRIPE_PUBLISHABLE_KEY` - From Stripe dashboard  
- `STRIPE_WEBHOOK_SECRET` - Created in Stripe webhook settings
- `PAYPAL_CLIENT_ID` - From PayPal developer dashboard
- `PAYPAL_CLIENT_SECRET` - From PayPal developer dashboard

4. **IMPORTANT:** Select all three environments (Production, Preview, Development)
5. Click **Save**

## Step 3: Database Schema Setup

After adding `DATABASE_URL` to Vercel, you need to push the schema to your database.

### Option A: Local Setup (Recommended)

1. Clone your repository locally:
   ```bash
   git clone https://github.com/mooses23/GemachHub.git
   cd GemachHub
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your production `DATABASE_URL`:
   ```bash
   DATABASE_URL="your-vercel-production-database-url"
   ```

4. Push the database schema:
   ```bash
   npm run db:push
   ```

5. Seed initial data:
   ```bash
   npm run seed
   ```

### Option B: Use Vercel Build Command (Advanced)

Update `vercel.json` to include database setup:
```json
{
  "buildCommand": "npm run build && npm run db:push",
  ...
}
```

## Step 4: Create Admin User

After seeding, you'll need an admin user. 

**Note:** The seed script (`npm run seed`) creates a default admin user automatically. If you need to create an additional admin user manually, you can use the SQL below.

To generate a password hash for manual user creation:
```bash
# Using Node.js
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your-password', 10, (err, hash) => console.log(hash));"

# Or using an online bcrypt generator (use trusted sources only)
```

Run this SQL directly in your database (via Neon dashboard or psql):

```sql
-- Create admin user (replace the password hash with your generated hash)
INSERT INTO users (username, password, email, first_name, last_name, role, is_admin, created_at)
VALUES (
  'admin',
  '$2a$10$your_generated_bcrypt_hash_here', -- Use bcrypt.hash() to generate this
  'admin@gemachhub.com',
  'Admin',
  'User',
  'admin',
  true,
  NOW()
);
```

## Step 5: Verify Deployment

1. Go to your Vercel deployment URL
2. Check that locations appear on the homepage
3. Test admin login at `/admin`
4. Verify database connection in the console

## Step 6: Configure Webhooks

### Stripe Webhooks
1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://your-domain.vercel.app/api/stripe/webhook`
3. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Copy the webhook secret to Vercel environment variables as `STRIPE_WEBHOOK_SECRET`

### PayPal Webhooks (if using PayPal)
1. Go to PayPal Developer Dashboard → Webhooks
2. Add webhook: `https://your-domain.vercel.app/api/paypal/webhook`
3. Select relevant events
4. Save credentials

## Troubleshooting

### Locations Not Showing
- **Cause**: Database is empty or `DATABASE_URL` is incorrect
- **Fix**: Check Vercel logs, verify `DATABASE_URL`, re-run `npm run db:push` and seed

### "Cannot find package 'vite'" Error
- **Cause**: devDependencies not installed
- **Fix**: Ensure `vercel.json` has `--include=dev` flag in install command

### Session/Login Issues
- **Cause**: Missing or invalid `SESSION_SECRET`
- **Fix**: Generate new secret with `openssl rand -base64 32` and add to Vercel

### Payment Failures
- **Cause**: Missing Stripe/PayPal credentials
- **Fix**: Add all payment-related environment variables to Vercel

## Removing Replit Dependencies

The codebase has been updated to work independently of Replit:
- Replit-specific Vite plugins only load in development when `REPL_ID` exists
- No Replit-specific code runs in production
- All environment variables are standard across platforms

### Migration Changes Made

1. **Stripe Client Rewritten** (`server/stripeClient.ts`)
   - Removed Replit connector API calls (`REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`)
   - Now uses standard `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` environment variables
   - Added `getStripeWebhookSecret()` for webhook signature verification

2. **Webhook Handlers Updated** (`server/webhookHandlers.ts`)
   - Removed `stripe-replit-sync` dependency
   - Implemented standard Stripe webhook event processing
   - Handles `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`

3. **Database Connection Optimized** (`server/db.ts`, `server/auth.ts`)
   - Added SSL configuration for production (Neon compatibility)
   - Optimized connection pool settings for serverless (max: 5, timeouts configured)
   - Added connection timeout handling

4. **ESM Import Extensions**
   - All server-side relative imports now include `.js` extensions
   - Required for Vercel's ESM runtime

5. **Health Check Endpoint**
   - Added `GET /api/health` for Vercel monitoring
   - Returns database connection status and timestamp

6. **Environment Variables Updated**
   - See `.env.example` for complete list
   - Documented Replit → Vercel variable mapping

## Post-Migration Checklist

- [ ] Database created and `DATABASE_URL` added to Vercel
- [ ] All environment variables configured in Vercel
- [ ] Database schema pushed (`npm run db:push`)
- [ ] Database seeded with initial data
- [ ] Admin user created
- [ ] Application deployed successfully
- [ ] Locations visible on homepage
- [ ] Admin login working
- [ ] Payment methods tested
- [ ] Webhooks configured (Stripe/PayPal)
- [ ] Custom domain configured (optional)

## Next Steps

1. **Custom Domain**: Add your custom domain in Vercel project settings
2. **SSL Certificate**: Vercel automatically provisions SSL
3. **Monitoring**: Set up error tracking (Sentry, LogRocket, etc.)
4. **Backup Strategy**: Configure database backups in Neon
5. **Performance**: Monitor with Vercel Analytics

Need help? Check the logs:
- Vercel Dashboard → Deployments → View Function Logs
- Neon Dashboard → Query History

## Environment Variables Reference

See `.env.example` for a complete list of all required and optional environment variables.

## Useful Commands

- `npm run verify-env` - Run the boot-time configuration checker (`server/startup-checks.ts`) as a CLI to verify environment variables before deploying
- `npm run db:push` - Push database schema to production
- `npm run seed` - Seed database with initial data
- `npm run build` - Build the application for production
- `npm run start` - Start the production server locally

