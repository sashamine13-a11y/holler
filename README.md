# Holler — real-time messenger

A real-time messenger built with Next.js 16, Ably, and Tailwind CSS.

## Features

- **Channels & chats** — broadcast channels and group chats
- **Real-time sync** — messages, polls, votes, and pins sync instantly via Ably
- **Online presence** — see who's online right now
- **Polls** — dynamic options (min 2, max 8), live results with progress bars
- **Anonymous questions** — ask and answer anonymously
- **Pinned messages** — highlight important info at the top
- **Image attachments** — send pictures (JPG/PNG/WebP, max 2MB)
- **Light/dark theme** — toggle in sidebar or join screen
- **Inline validation** — clear error messages under inputs
- **Animations** — smooth transitions throughout
- **Security headers** — CSP, HSTS, X-Frame-Options, and more
- **Server-side code verification** — access codes stored in env, not in client bundle
- **Rate limiting** — 10 attempts per minute per IP

## Tech Stack

- **Framework:** Next.js 16 (App Router, standalone output)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **Real-time:** Ably (managed, free tier: 3M messages/month)
- **Database:** Prisma + SQLite (optional, for persistence)
- **Icons:** Lucide React

## Getting Started

### Prerequisites

- Node.js 20+ or Bun
- An Ably account (free at https://ably.com)

### Installation

```bash
# Clone the repo
git clone https://github.com/sashamine13-a11y/holler.git
cd holler
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your codes and Ably key
```

### Environment Variables

```env
# Server-side (NOT exposed to client)
CLASS_CODE=519284       # Regular user code
ADMIN_CODE=836471       # Admin code (channel management)

# Client-side (exposed to browser, safe to share)
NEXT_PUBLIC_ABLY_KEY=your_ably_client_api_key
```

### Get Ably API Key

1. Sign up at https://ably.com (free, no credit card)
2. Create a new app
3. Go to API Keys → copy the **client API key** (not root!)
4. Add to `.env` as `NEXT_PUBLIC_ABLY_KEY`

### Development

```bash
bun run dev
# Open http://localhost:3000
```

### Production

```bash
bun run build
bun run start
```

## Deploy to Vercel (recommended)

1. Push to GitHub
2. Go to https://vercel.com → New Project → Import `holler`
3. Add Environment Variables:
   - `CLASS_CODE` = `519284`
   - `ADMIN_CODE` = `836471`
   - `NEXT_PUBLIC_ABLY_KEY` = your Ably key
4. Deploy — done in 2 minutes

## Access Codes

| Role | Code | Permissions |
|------|------|-------------|
| Member | `519284` | Read, write, vote, ask anonymous questions |
| Admin | `836471` | All member permissions + create/delete channels, pin messages |

Change codes in `.env` before deploying.

## License

MIT
