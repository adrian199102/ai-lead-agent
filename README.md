# ai-lead-agent
Project Buddy
# AI Lead Agent MVP

## Overview

AI Lead Agent is a production-oriented multi-agent AI lead qualification system focused on:

* deterministic orchestration
* lightweight AI agents
* minimal token usage
* low operational cost
* structured state management

The system avoids autonomous agent loops and instead uses:

```text
Deterministic Router
+
Micro AI Extraction Agents
+
Structured PostgreSQL Memory
```

---

# Architecture

```text
Incoming Message
        ↓
Webhook/API
        ↓
Router (deterministic)
        ↓
Micro-Agent
        ↓
OpenAI Extraction
        ↓
Structured JSON
        ↓
Supabase State Update
        ↓
Response Sender
```

---

# Technology Stack

| Layer              | Technology            |
| ------------------ | --------------------- |
| Backend            | Node.js               |
| API Server         | Fastify               |
| Database           | PostgreSQL (Supabase) |
| AI Provider        | OpenAI                |
| API Testing        | Thunder Client        |
| Hosting            | ClawCloud             |
| Messaging          | WhatsApp/Twilio       |
| Frontend (planned) | Next.js               |

---

# Project Structure

```text
ai-lead-agent
│
├── .env
├── .gitignore
├── package.json
├── server.js
│
├── src
│   ├── agents
│   ├── controllers
│   ├── prompts
│   ├── router
│   ├── services
│   └── utils
│
└── README.md
```

---

# Installed Dependencies

```bash
npm install fastify dotenv @supabase/supabase-js openai
```

---

# Environment Variables

Create `.env`

```env
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_ANON_KEY=your_publishable_key
OPENAI_API_KEY=sk-proj-xxxxx
```

---

# .gitignore

```text
node_modules
.env
```

---

# PostgreSQL Schema

## leads

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT,
  name TEXT,
  stage TEXT DEFAULT 'new',
  status TEXT DEFAULT 'active',
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## lead_state

```sql
CREATE TABLE lead_state (
  lead_id UUID PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,

  budget TEXT,
  timeline TEXT,
  location TEXT,
  business_type TEXT,

  qualified BOOLEAN DEFAULT FALSE,
  score INTEGER DEFAULT 0,

  last_agent TEXT,

  updated_at TIMESTAMP DEFAULT NOW()
);
```

## messages

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,

  direction TEXT,
  message TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);
```

## agent_runs

```sql
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,

  agent_name TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,

  success BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT NOW()
);
```

---

# Supabase Service

`src/services/supabase.js`

```javascript
import dotenv from 'dotenv'
dotenv.config()

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default supabase
```

---

# OpenAI Service

`src/services/openai.js`

```javascript
import OpenAI from 'openai'
import dotenv from 'dotenv'

dotenv.config()

const apiKey = process.env.OPENAI_API_KEY

const openai = new OpenAI({
  apiKey: apiKey
})

export default openai
```

---

# Deterministic Router

`src/router/router.js`

```javascript
export function routeLead(state) {

  if (!state.name) {
    return 'engagement'
  }

  if (!state.budget || !state.timeline) {
    return 'qualification'
  }

  if (state.qualified) {
    return 'scheduling'
  }

  return 'followup'
}
```

---

# Qualification Micro-Agent

`src/agents/qualificationAgent.js`

```javascript
import openai from '../services/openai.js'

export async function qualificationAgent(message) {

  const completion =
    await openai.chat.completions.create({

      model: 'gpt-4.1-mini',

      messages: [
        {
          role: 'system',
          content: `
Extract:
- budget
- timeline

Return JSON only.
`
        },
        {
          role: 'user',
          content: message
        }
      ],

      response_format: {
        type: 'json_object'
      }
    })

  return JSON.parse(
    completion.choices[0].message.content
  )
}
```

---

# Fastify Server

`server.js`

```javascript
import dotenv from 'dotenv'
dotenv.config()

import Fastify from 'fastify'

import { qualificationAgent }
from './src/agents/qualificationAgent.js'

const fastify = Fastify({
  logger: true
})

fastify.get('/', async () => {
  return {
    status: 'AI Agent Running'
  }
})

fastify.post('/test-agent', async (request) => {

  const { message } = request.body

  const result =
    await qualificationAgent(message)

  return result
})

fastify.listen({
  port: 3000
})
```

---

# API Testing

## Endpoint

```text
POST http://localhost:3000/test-agent
```

## Request Body

```json
{
  "message": "Budget maybe 100k next month"
}
```

## Expected Response

```json
{
  "budget": "100k",
  "timeline": "next month"
}
```

---

# Current System Status

| Component            | Status |
| -------------------- | ------ |
| Node.js backend      | ✅      |
| Fastify server       | ✅      |
| OpenAI SDK           | ✅      |
| Supabase connection  | ✅      |
| Deterministic router | ✅      |
| Qualification agent  | ✅      |
| Thunder Client       | ✅      |
| API endpoint         | ✅      |
| AI request pipeline  | ✅      |

---

# Current Architecture Principles

## Implemented

* deterministic orchestration
* micro-agents
* structured database memory
* JSON extraction
* token optimization
* lightweight prompts

## Avoided

* autonomous agents
* LangChain orchestration
* vector DB
* agent chatter
* full conversation memory
* long reasoning chains

---

# Next Planned Steps

```text
Webhook
→ Save inbound message
→ Load lead state
→ Route lead
→ Run correct micro-agent
→ Update Supabase
→ Send response
```

---

# Future Planned Features

| Feature               | Phase |
| --------------------- | ----- |
| WhatsApp integration  | Next  |
| State persistence     | Next  |
| Lead scoring          | Later |
| Scheduling agent      | Later |
| Dashboard UI          | Later |
| Queue system          | Later |
| Analytics             | Later |
| Multi-channel support | Later |

---

# Key Technical Insight

The system architecture intentionally uses:

```text
Deterministic Workflow Engine
+
AI Extraction Workers
```

NOT:

```text
Autonomous Multi-Agent AI System
```

This provides:

* lower operational cost
* predictable behavior
* easier debugging
* lower token usage
* scalability
* production reliability

