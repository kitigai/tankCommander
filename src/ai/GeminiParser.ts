// Gemini API integration for command parsing

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { COMMAND_PARSER_SYSTEM_PROMPT, ParsedCommandResponse } from './commandSchema';
import { GameCommand, createCommand } from '../commands/types';

export interface ParserContext {
  currentBodyAngle: number;
  currentTurretAngle: number;
}

export interface ParseResult {
  commands: GameCommand[];
  interpretation: string;
  raw?: ParsedCommandResponse;
}

export class GeminiParser {
  private model: GenerativeModel;

  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      systemInstruction: COMMAND_PARSER_SYSTEM_PROMPT,
    });
  }

  async parseCommand(
    naturalLanguage: string,
    context?: ParserContext
  ): Promise<ParseResult> {
    const contextString = context
      ? `現在の戦車状態: 車体角度 ${context.currentBodyAngle}度、砲塔角度 ${context.currentTurretAngle}度（車体からの相対角度）`
      : '';

    const userMessage = contextString
      ? `${contextString}\n\nコマンドを解析してください: "${naturalLanguage}"`
      : `コマンドを解析してください: "${naturalLanguage}"`;

    const result = await this.model.generateContent(userMessage);
    const response = result.response;
    const text = response.text();

    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;

    let parsed: ParsedCommandResponse;
    try {
      parsed = JSON.parse(jsonStr.trim());
    } catch {
      // Try to find JSON object in the text
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        parsed = JSON.parse(objectMatch[0]);
      } else {
        throw new Error(`Failed to parse JSON response: ${text}`);
      }
    }

    // Convert parsed response to GameCommand array
    const commands: GameCommand[] = parsed.commands.map((cmd, index) => {
      const baseProps = {
        id: `cmd_${Date.now()}_${index}`,
        timestamp: Date.now(),
      };

      switch (cmd.type) {
        case 'rotate_body':
          return {
            ...baseProps,
            type: 'rotate_body' as const,
            degrees: cmd.degrees ?? 0,
            speed: cmd.speed,
          };
        case 'move':
          return {
            ...baseProps,
            type: 'move' as const,
            distance: cmd.distance ?? 0,
            speed: cmd.speed,
          };
        case 'rotate_turret':
          return {
            ...baseProps,
            type: 'rotate_turret' as const,
            degrees: cmd.degrees ?? 0,
            speed: cmd.speed,
          };
        case 'fire':
          return {
            ...baseProps,
            type: 'fire' as const,
          };
        case 'stop':
          return {
            ...baseProps,
            type: 'stop' as const,
          };
        case 'wait':
          return {
            ...baseProps,
            type: 'wait' as const,
            durationMs: cmd.durationMs ?? 1000,
          };
        default:
          throw new Error(`Unknown command type: ${(cmd as { type: string }).type}`);
      }
    });

    return {
      commands,
      interpretation: parsed.interpretation,
      raw: parsed,
    };
  }
}

// Mock parser for testing without API
export class MockParser {
  async parseCommand(
    naturalLanguage: string,
    _context?: ParserContext
  ): Promise<ParseResult> {
    // Simple pattern matching for testing
    const commands: GameCommand[] = [];
    const input = naturalLanguage.toLowerCase();

    // Check for rotation commands
    const rotateMatch = input.match(/(右|左|right|left)\s*(\d+)\s*(度|deg)?/);
    if (rotateMatch) {
      const direction = rotateMatch[1] === '右' || rotateMatch[1] === 'right' ? 1 : -1;
      const degrees = parseInt(rotateMatch[2]) * direction;
      commands.push(createCommand('rotate_body', { degrees }));
    }

    // Check for move commands
    const moveMatch = input.match(/(前進|後退|forward|backward)\s*(\d+)\s*(m|メートル)?/);
    if (moveMatch) {
      const direction = moveMatch[1] === '前進' || moveMatch[1] === 'forward' ? 1 : -1;
      const distance = parseInt(moveMatch[2]) * direction;
      commands.push(createCommand('move', { distance }));
    }

    // Check for turret rotation
    const turretMatch = input.match(/砲塔\s*(右|左)\s*(\d+)\s*(度)?/);
    if (turretMatch) {
      const direction = turretMatch[1] === '右' ? 1 : -1;
      const degrees = parseInt(turretMatch[2]) * direction;
      commands.push(createCommand('rotate_turret', { degrees }));
    }

    // Check for fire command
    if (input.includes('発射') || input.includes('撃') || input.includes('fire')) {
      commands.push(createCommand('fire', {}));
    }

    // Check for stop command
    if (input.includes('停止') || input.includes('止') || input.includes('stop')) {
      commands.push(createCommand('stop', {}));
    }

    // Default if no commands parsed
    if (commands.length === 0) {
      return {
        commands: [],
        interpretation: '解析できませんでした。「右45度」「前進10m」「発射」などの形式でお試しください。',
      };
    }

    return {
      commands,
      interpretation: `Mock解析: ${commands.map((c) => c.type).join(' → ')}`,
    };
  }
}
