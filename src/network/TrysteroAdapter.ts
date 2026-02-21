// Server-relay (WebSocket) adapter implementation

import type { NetworkAdapter } from './NetworkManager';
import type { GameCommand } from '../commands/types';
import type { GameStateData } from '../state/GameState';
import { GameState } from '../state/GameState';
import type { CommandExecutor } from '../commands/CommandExecutor';
import type {
  ReliableMessage,
  CommandMessage,
  WelcomeMessage,
  CommandAckMessage,
  PhaseChangeMessage,
} from './protocol';

export interface TrysteroConfig {
  roomCode: string;
  isHost: boolean;
}

type RelayOutbound =
  | { type: 'reliable'; msg: ReliableMessage; targetPeerId?: string }
  | { type: 'state'; serialized: string };

type RelayInbound =
  | { type: 'joined'; selfId: string; role: 'host' | 'client'; hostId?: string; tankId?: string; peers?: Array<{ peerId: string; tankId: string }> }
  | { type: 'peer_joined'; peerId: string; tankId: string }
  | { type: 'peer_left'; peerId: string; tankId?: string }
  | { type: 'reliable'; fromPeerId: string; msg: ReliableMessage }
  | { type: 'state'; fromPeerId: string; serialized: string }
  | { type: 'error'; code: string; message: string };

const STATE_SYNC_INTERVAL_MS = 67; // ~15 Hz

function createLocalPeerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `peer_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveRelayEndpoint(): string {
  const configured = import.meta.env.VITE_RELAY_WS_URL?.trim();
  if (configured) return configured;

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/relay`;
  }

  throw new Error('Relay endpoint is not configured. Set VITE_RELAY_WS_URL.');
}

export class TrysteroAdapter implements NetworkAdapter {
  private config: TrysteroConfig;
  private socket: WebSocket | null = null;
  private _connected = false;
  private _playerId: string | null = null;
  private _tankId: string | null = null;
  private _hostId: string | null = null;
  private localPeerId = createLocalPeerId();
  private manualDisconnect = false;

  private stateCallback?: (state: GameStateData) => void;
  private commandAckCallback?: (commandId: string, success: boolean, error?: string) => void;
  private playerJoinedCallback?: (playerId: string) => void;
  private playerLeftCallback?: (playerId: string) => void;

  private gameState?: GameState;
  private commandExecutor?: CommandExecutor;
  private peerTankMap: Map<string, string> = new Map();
  private stateSyncTimer?: ReturnType<typeof setInterval>;

  private onPeerJoinedLobbyCallback?: (peerId: string, tankId: string) => void;
  private onPeerLeftLobbyCallback?: (peerId: string) => void;
  private onWelcomeCallback?: (msg: WelcomeMessage) => void;
  private onGameStartCallback?: () => void;

  constructor(config: TrysteroConfig) {
    this.config = config;
  }

  onPeerJoinedLobby(callback: (peerId: string, tankId: string) => void): void {
    this.onPeerJoinedLobbyCallback = callback;
  }

  onPeerLeftLobby(callback: (peerId: string) => void): void {
    this.onPeerLeftLobbyCallback = callback;
  }

  onWelcome(callback: (msg: WelcomeMessage) => void): void {
    this.onWelcomeCallback = callback;
  }

  onGameStart(callback: () => void): void {
    this.onGameStartCallback = callback;
  }

  setHostReferences(gameState: GameState, commandExecutor: CommandExecutor): void {
    this.gameState = gameState;
    this.commandExecutor = commandExecutor;
  }

  getPeerCount(): number {
    return this.peerTankMap.size;
  }

  getTankIdForPeer(peerId: string): string | undefined {
    return this.peerTankMap.get(peerId);
  }

  getAllPeerTankMappings(): Map<string, string> {
    return new Map(this.peerTankMap);
  }

  get tankId(): string | null {
    return this._tankId;
  }

  get isHost(): boolean {
    return this.config.isHost;
  }

  async connect(): Promise<void> {
    console.log('[RelayAdapter] ===== connect() 開始 =====');
    console.log(`[RelayAdapter] Role: ${this.config.isHost ? 'HOST' : 'CLIENT'}`);
    console.log(`[RelayAdapter] RoomCode: ${this.config.roomCode}`);

    const endpoint = new URL(resolveRelayEndpoint());
    endpoint.searchParams.set('roomCode', this.config.roomCode);
    endpoint.searchParams.set('role', this.config.isHost ? 'host' : 'client');
    endpoint.searchParams.set('peerId', this.localPeerId);

    this.manualDisconnect = false;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(endpoint.toString());
      this.socket = ws;
      let joined = false;

      ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(String(event.data)) as RelayInbound;
          if (packet.type === 'joined') {
            joined = true;
            this.handleJoined(packet);
            this._connected = true;
            resolve();
            return;
          }

          if (packet.type === 'error') {
            console.error(`[RelayAdapter] server error: ${packet.code} ${packet.message}`);
            if (!joined) reject(new Error(packet.message));
            return;
          }

          this.handleServerPacket(packet);
        } catch (error) {
          console.warn('[RelayAdapter] invalid packet', error);
        }
      };

      ws.onerror = () => {
        if (!joined) reject(new Error('Relay websocket connection failed'));
      };

      ws.onclose = () => {
        const wasConnected = this._connected;
        if (!joined) {
          reject(new Error('Relay websocket closed before join handshake'));
        }
        this._connected = false;
        this.stopStateSync();

        if (!this.manualDisconnect && wasConnected && !this.config.isHost) {
          this.playerLeftCallback?.(this._hostId ?? 'host');
        }
      };
    });

    console.log('[RelayAdapter] ===== connect() 完了 =====');
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.stopStateSync();

    if (this.socket) {
      this.socket.close(1000, 'client disconnect');
      this.socket = null;
    }

    this._connected = false;
    this.peerTankMap.clear();
  }

  sendCommand(tankId: string, command: GameCommand): void {
    if (this.config.isHost) {
      if (this.commandExecutor) {
        this.commandExecutor.enqueue(tankId, command);
        this.commandAckCallback?.(command.id, true);
      }
      return;
    }

    const msg: CommandMessage = { type: 'command', tankId, command };
    this.sendPacket({ type: 'reliable', msg });
  }

  onStateUpdate(callback: (state: GameStateData) => void): void {
    this.stateCallback = callback;
  }

  onCommandAck(callback: (commandId: string, success: boolean, error?: string) => void): void {
    this.commandAckCallback = callback;
  }

  onPlayerJoined(callback: (playerId: string) => void): void {
    this.playerJoinedCallback = callback;
  }

  onPlayerLeft(callback: (playerId: string) => void): void {
    this.playerLeftCallback = callback;
  }

  isConnected(): boolean {
    return this._connected;
  }

  getPlayerId(): string | null {
    return this._playerId;
  }

  startStateBroadcast(): void {
    if (!this.config.isHost || !this.gameState) return;

    const phaseMsg: PhaseChangeMessage = {
      type: 'phase_change',
      phase: 'playing',
    };
    this.sendReliableMsg(phaseMsg);

    this.stateSyncTimer = setInterval(() => {
      if (!this.gameState) return;
      this.sendPacket({ type: 'state', serialized: this.gameState.serialize() });
    }, STATE_SYNC_INTERVAL_MS);
  }

  private stopStateSync(): void {
    if (this.stateSyncTimer) {
      clearInterval(this.stateSyncTimer);
      this.stateSyncTimer = undefined;
    }
  }

  private sendPacket(packet: RelayOutbound): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(packet));
  }

  private sendReliableMsg(msg: ReliableMessage, targetPeerId?: string): void {
    this.sendPacket({ type: 'reliable', msg, targetPeerId });
  }

  private handleJoined(packet: Extract<RelayInbound, { type: 'joined' }>): void {
    this._playerId = packet.selfId;

    if (this.config.isHost) {
      this._hostId = packet.selfId;
      this._tankId = 'player_0';
      this.peerTankMap.clear();
      for (const peer of packet.peers ?? []) {
        this.peerTankMap.set(peer.peerId, peer.tankId);
      }
      return;
    }

    this._hostId = packet.hostId ?? null;
    this._tankId = packet.tankId ?? null;

    if (this._hostId && this._tankId) {
      const welcome: WelcomeMessage = {
        type: 'welcome',
        playerId: this._playerId,
        tankId: this._tankId,
        hostId: this._hostId,
      };
      this.onWelcomeCallback?.(welcome);
    }
  }

  private handleServerPacket(packet: Exclude<RelayInbound, { type: 'joined' | 'error' }>): void {
    switch (packet.type) {
      case 'peer_joined':
        this.peerTankMap.set(packet.peerId, packet.tankId);
        if (this.config.isHost) {
          this.onPeerJoinedLobbyCallback?.(packet.peerId, packet.tankId);
        }
        this.playerJoinedCallback?.(packet.peerId);
        break;
      case 'peer_left':
        this.peerTankMap.delete(packet.peerId);
        if (this.config.isHost) {
          if (packet.tankId && this.gameState) {
            this.gameState.removeTank(packet.tankId);
          }
          this.onPeerLeftLobbyCallback?.(packet.peerId);
        }
        this.playerLeftCallback?.(packet.peerId);
        break;
      case 'reliable':
        this.handleReliable(packet.msg, packet.fromPeerId);
        break;
      case 'state':
        this.handleState(packet.serialized);
        break;
    }
  }

  private handleReliable(msg: ReliableMessage, fromPeerId: string): void {
    if (this.config.isHost) {
      if (msg.type === 'command') {
        this.handleHostReceiveCommand(msg, fromPeerId);
      }
      return;
    }

    switch (msg.type) {
      case 'welcome':
        this._playerId = msg.playerId;
        this._tankId = msg.tankId;
        this._hostId = msg.hostId;
        this.onWelcomeCallback?.(msg);
        break;
      case 'player_joined':
        this.playerJoinedCallback?.(msg.playerId);
        break;
      case 'player_left':
        this.playerLeftCallback?.(msg.playerId);
        break;
      case 'command_ack':
        this.commandAckCallback?.(msg.commandId, msg.success, msg.error);
        break;
      case 'phase_change':
        if (msg.phase === 'playing') {
          this.onGameStartCallback?.();
        }
        break;
    }
  }

  private handleState(serialized: string): void {
    if (this.config.isHost) return;

    try {
      const deserialized = GameState.deserialize(serialized);
      this.stateCallback?.(deserialized.getState());
    } catch (error) {
      console.warn('[RelayAdapter] Failed to deserialize state:', error);
    }
  }

  private handleHostReceiveCommand(msg: CommandMessage, peerId: string): void {
    if (!this.commandExecutor) return;

    const mappedTankId = this.peerTankMap.get(peerId);
    if (!mappedTankId) {
      const ack: CommandAckMessage = {
        type: 'command_ack',
        commandId: msg.command.id,
        success: false,
        error: 'Unknown peer',
      };
      this.sendReliableMsg(ack, peerId);
      return;
    }

    try {
      this.commandExecutor.enqueue(mappedTankId, msg.command);
      const ack: CommandAckMessage = {
        type: 'command_ack',
        commandId: msg.command.id,
        success: true,
      };
      this.sendReliableMsg(ack, peerId);
    } catch (error) {
      const ack: CommandAckMessage = {
        type: 'command_ack',
        commandId: msg.command.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      this.sendReliableMsg(ack, peerId);
    }
  }
}
