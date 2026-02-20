// Gemini API integration for command parsing
// APIプロキシ経由でGemini APIを呼び出す（APIキーはサーバー側で保持）

import { ParsedCommandResponse } from './commandSchema';
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
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async parseCommand(
    naturalLanguage: string,
    context?: ParserContext
  ): Promise<ParseResult> {
    const body: {
      naturalLanguage: string;
      context?: { currentBodyAngle: number; currentTurretAngle: number };
    } = { naturalLanguage };

    if (context) {
      body.context = {
        currentBodyAngle: context.currentBodyAngle,
        currentTurretAngle: context.currentTurretAngle,
      };
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        (errorData as { error?: string }).error ?? `API error: ${response.status}`;
      throw new Error(errorMessage);
    }

    const parsed: ParsedCommandResponse = await response.json();

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
