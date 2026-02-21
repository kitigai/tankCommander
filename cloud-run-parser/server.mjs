import http from 'node:http';
import { GoogleGenerativeAI } from '@google/generative-ai';

const PORT = Number(process.env.PORT || 8080);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const COMMAND_PARSER_SYSTEM_PROMPT = `
あなたは戦車ゲーム用コマンド解析器です。
ユーザーの自然言語を、次のJSON形式へ変換してください。

{
  "commands": [
    {
      "type": "rotate_body | move | rotate_turret | fire | stop | wait",
      "degrees": number,
      "distance": number,
      "speed": number,
      "durationMs": number
    }
  ],
  "executionMode": "sequential",
  "interpretation": "日本語の解釈"
}

制約:
- JSONのみを返す
- 不要なキーは省略する
- commands は必ず配列
`;

function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...corsHeaders,
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeParsed(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response: object expected');
  }

  const commands = Array.isArray(data.commands) ? data.commands : [];
  const interpretation =
    typeof data.interpretation === 'string'
      ? data.interpretation
      : '解析結果を生成しました。';

  return {
    commands,
    executionMode: 'sequential',
    interpretation,
  };
}

async function callGeminiWithRetry(userMessage, maxRetries = 3) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: COMMAND_PARSER_SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const result = await model.generateContent(userMessage);
      const text = result.response.text();
      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      try {
        return normalizeParsed(JSON.parse(text));
      } catch {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : text;
        return normalizeParsed(JSON.parse(jsonStr.trim()));
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable =
        lastError.message.includes('503') ||
        lastError.message.includes('429') ||
        lastError.message.includes('overloaded');

      if (retryable && attempt < maxRetries - 1) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error('Gemini retry failed');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (url.pathname === '/health') {
    jsonResponse(res, 200, { ok: true });
    return;
  }

  if (url.pathname !== '/parse-command' || req.method !== 'POST') {
    jsonResponse(res, 404, { error: 'Not Found' });
    return;
  }

  if (!GEMINI_API_KEY) {
    jsonResponse(res, 500, { error: 'GEMINI_API_KEY is not configured' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const naturalLanguage = typeof body.naturalLanguage === 'string' ? body.naturalLanguage.trim() : '';
    const context = body.context;

    if (!naturalLanguage) {
      jsonResponse(res, 400, { error: 'naturalLanguage is required' });
      return;
    }

    const contextString = context
      ? `現在の戦車状態: 車体角度 ${context.currentBodyAngle}度、砲塔角度 ${context.currentTurretAngle}度（車体からの相対角度）`
      : '';

    const userMessage = contextString
      ? `${contextString}\n\nコマンドを解析してください: "${naturalLanguage}"`
      : `コマンドを解析してください: "${naturalLanguage}"`;

    const parsed = await callGeminiWithRetry(userMessage, 3);
    jsonResponse(res, 200, parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const retryable =
      message.includes('503') ||
      message.includes('429') ||
      message.includes('overloaded');

    jsonResponse(res, retryable ? 503 : 500, {
      error: message,
      retryable,
    });
  }
});

server.listen(PORT, () => {
  console.log(`[cloud-run-parser] listening on :${PORT}`);
  console.log(`[cloud-run-parser] model=${GEMINI_MODEL}`);
});
