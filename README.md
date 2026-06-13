# Omniblitz — Multi-Tenant Facebook Messenger SaaS

A multi-tenant chatbot platform that lets organizations connect multiple Facebook Pages, receive inbound messages (text, images, audio) via webhooks, and reply from a unified dashboard.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Facebook Platform                               │
│   Messenger Webhooks  │  Graph API (send/receive)  │  Facebook Login (OAuth) │
└──────────────┬────────────────────────┬──────────────────────┬──────────────┘
               │ POST /webhooks/messenger│                      │ OAuth callback
               ▼                        │                      ▼
┌──────────────────────────┐           │         ┌────────────────────────────┐
│   Express API (apps/api)   │◄──────────┘         │  Next.js Dashboard (web)   │
│  • Webhook verification  │                       │  • Page connection UI      │
│  • Page ID router        │                       │  • Inbox / conversations   │
│  • Message persistence   │                       │  • Reply composer          │
│  • Outbound send API     │                       │  • Tenant settings         │
└──────────────┬───────────┘                       └──────────────┬─────────────┘
               │                                                   │
               ▼                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PostgreSQL (Prisma ORM — packages/database)              │
│  Tenant → User → FacebookPage → Conversation → Message (+ Attachments)      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Monorepo Layout

```
omniblitz/
├── apps/
│   ├── api/                    # Express REST + Webhook server
│   │   └── src/
│   │       ├── index.ts
│   │       ├── routes/
│   │       ├── webhooks/
│   │       │   └── messenger.handler.ts   # ← Central Page ID router
│   │       └── services/
│   └── web/                    # Next.js 14 App Router dashboard
│       └── src/app/
├── packages/
│   └── database/               # Shared Prisma client + schema
│       └── prisma/schema.prisma
├── docker-compose.yml          # Local PostgreSQL
└── .env.example
```

## Multi-Tenancy Model

| Layer | Strategy |
|-------|----------|
| **Data isolation** | Every row scoped by `tenantId`; Prisma middleware enforces tenant context |
| **Facebook Pages** | One tenant can connect N pages; each page has its own Page Access Token |
| **Webhook routing** | Incoming payload `entry[].id` = Facebook Page ID → lookup `FacebookPage` → derive `tenantId` |
| **Auth** | Users belong to one tenant; JWT/session carries `tenantId` for API calls |

## Request Flow: Inbound Message

1. Facebook POSTs to `GET/POST /webhooks/messenger`
2. Handler verifies `X-Hub-Signature-256` (POST) or `hub.verify_token` (GET)
3. For each `entry`, extract `entry.id` (Page ID)
4. Lookup `FacebookPage` by `pageId` → get `tenantId` + `pageAccessToken`
5. For each `messaging` event, upsert `MessengerUser`, `Conversation`, `Message`
6. Download attachments (image/audio) via Graph API, store URL + metadata
7. Emit real-time event to dashboard (WebSocket/SSE — future)

## Request Flow: Outbound Reply

1. Agent sends reply from dashboard → `POST /api/conversations/:id/messages`
2. API validates tenant ownership of conversation
3. Send via Graph API `/{page-id}/messages` using stored Page Access Token
4. Persist outbound `Message` record

## Environment Variables

See `.env.example` for required keys:

- `DATABASE_URL` — PostgreSQL connection string
- `FB_APP_ID`, `FB_APP_SECRET`, `FB_VERIFY_TOKEN` — Facebook app credentials
- `JWT_SECRET` — API authentication
- `NEXT_PUBLIC_API_URL` — Frontend → API base URL

## Quick Start

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
npm install

# 3. Push schema
npm run db:push

# 4. Run API (port 4000) and Web (port 3000)
npm run dev
```

## Facebook App Setup

1. Create a Meta app with **Messenger** and **Facebook Login** products
2. Add webhook URL: `https://your-domain.com/webhooks/messenger`
3. Subscribe to: `messages`, `messaging_postbacks`, `message_deliveries`, `message_reads`
4. Request permissions: `pages_show_list`, `pages_messaging`, `pages_manage_metadata`
