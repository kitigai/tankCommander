# Cloud Run Parser

Gemini command parser service for Tank Commander.

## Local Run

```bash
cd cloud-run-parser
npm install
GEMINI_API_KEY=YOUR_KEY npm start
```

Health check:

```bash
curl http://localhost:8080/health
```

## Cloud Run Deploy

```bash
cd cloud-run-parser

gcloud run deploy tank-commander-parser \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=YOUR_KEY,GEMINI_MODEL=gemini-2.5-flash
```

After deploy, set frontend env:

```bash
VITE_API_ENDPOINT=https://tank-commander-parser-<hash>-uc.a.run.app/parse-command
```
