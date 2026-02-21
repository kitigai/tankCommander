# Tank Commander Relay Worker

Cloudflare Durable Objects based WebSocket relay server.

## Deploy

```bash
cd relay-worker
npx wrangler deploy
```

After deploy, set this in the frontend build environment:

```bash
VITE_RELAY_WS_URL=wss://<your-worker-subdomain>.workers.dev/relay
```
