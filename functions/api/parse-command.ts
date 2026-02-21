// Cloudflare Pages Function: Gemini APIプロキシ
// APIキーをサーバー側で保持し、フロントエンドから安全にGemini APIを呼び出す

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  COMMAND_PARSER_SYSTEM_PROMPT,
  type ParsedCommandResponse,
} from '../../src/ai/commandSchema';

interface Env {
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
}

interface RequestBody {
  naturalLanguage: string;
  context?: {
    currentBodyAngle: number;
    currentTurretAngle: number;
  };
}

// CORSヘッダー（ローカル開発 + 本番共用）
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// OPTIONSリクエスト（CORSプリフライト）
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

// POSTリクエスト: コマンド解析
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    // APIキーの確認
    const apiKey = context.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonResponse(
        { error: 'GEMINI_API_KEY is not configured on the server' },
        500
      );
    }

    // リクエストボディの解析
    let body: RequestBody;
    try {
      body = await context.request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON request body' }, 400);
    }

    // バリデーション
    if (
      !body.naturalLanguage ||
      typeof body.naturalLanguage !== 'string' ||
      body.naturalLanguage.length === 0
    ) {
      return jsonResponse(
        { error: 'naturalLanguage is required and must be a non-empty string' },
        400
      );
    }

    if (body.naturalLanguage.length > 500) {
      return jsonResponse(
        { error: 'naturalLanguage must be 500 characters or less' },
        400
      );
    }

    // ユーザーメッセージの構築
    const contextString = body.context
      ? `現在の戦車状態: 車体角度 ${body.context.currentBodyAngle}度、砲塔角度 ${body.context.currentTurretAngle}度（車体からの相対角度）`
      : '';

    const userMessage = contextString
      ? `${contextString}\n\nコマンドを解析してください: "${body.naturalLanguage}"`
      : `コマンドを解析してください: "${body.naturalLanguage}"`;

    const modelName = context.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

    // Gemini API呼び出し（リトライ付き）
    const parsed = await callGeminiWithRetry(apiKey, modelName, userMessage, 3);

    return jsonResponse(parsed, 200);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error';
    console.error('[parse-command] Error:', message);

    // 503エラー（Gemini過負荷）はそのまま返す
    if (message.includes('503') || message.includes('overloaded')) {
      return jsonResponse(
        { error: 'AI service temporarily unavailable', retryable: true },
        503
      );
    }

    return jsonResponse({ error: message }, 500);
  }
};

/** Gemini API呼び出し（リトライ付き） */
async function callGeminiWithRetry(
  apiKey: string,
  modelName: string,
  userMessage: string,
  maxRetries: number
): Promise<ParsedCommandResponse> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: COMMAND_PARSER_SYSTEM_PROMPT,
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await model.generateContent(userMessage);
      const response = result.response;
      const text = response.text();

      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      // JSONの抽出（markdownコードブロック対応）
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : text;

      try {
        return JSON.parse(jsonStr.trim()) as ParsedCommandResponse;
      } catch {
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          return JSON.parse(objectMatch[0]) as ParsedCommandResponse;
        }
        throw new Error(`Failed to parse JSON response: ${text}`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 503/429 エラーならリトライ
      const isRetryable =
        lastError.message.includes('503') ||
        lastError.message.includes('429') ||
        lastError.message.includes('overloaded');

      if (isRetryable && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error('Max retries exceeded');
}

/** JSONレスポンスヘルパー */
function jsonResponse(data: object, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}
