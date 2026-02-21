export interface Env {
  ROOM_HUB: DurableObjectNamespace;
}

type Role = 'host' | 'client';

interface PeerInfo {
  id: string;
  role: Role;
  ws: WebSocket;
  tankId?: string;
}

type ClientToServer =
  | { type: 'reliable'; msg: unknown; targetPeerId?: string }
  | { type: 'state'; serialized: string };

type ServerToClient =
  | { type: 'joined'; selfId: string; role: Role; hostId?: string; tankId?: string; peers?: Array<{ peerId: string; tankId: string }> }
  | { type: 'peer_joined'; peerId: string; tankId: string }
  | { type: 'peer_left'; peerId: string; tankId?: string }
  | { type: 'reliable'; fromPeerId: string; msg: unknown }
  | { type: 'state'; fromPeerId: string; serialized: string }
  | { type: 'error'; code: string; message: string };

function json(data: ServerToClient): string {
  return JSON.stringify(data);
}

function makePeerId(): string {
  return crypto.randomUUID();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok');
    }

    if (url.pathname !== '/relay') {
      return new Response('Not Found', { status: 404 });
    }

    const roomCode = url.searchParams.get('roomCode')?.trim().toUpperCase();
    if (!roomCode) {
      return new Response('roomCode is required', { status: 400 });
    }

    const id = env.ROOM_HUB.idFromName(roomCode);
    const stub = env.ROOM_HUB.get(id);
    return stub.fetch(request);
  },
};

export class RoomHub extends DurableObject {
  private peers: Map<string, PeerInfo> = new Map();
  private hostPeerId: string | null = null;
  private nextTankIndex = 0;

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }

    const url = new URL(request.url);
    const role = (url.searchParams.get('role') === 'host' ? 'host' : 'client') as Role;
    const requestedPeerId = url.searchParams.get('peerId')?.trim();
    const peerId = requestedPeerId || makePeerId();

    if (role === 'host' && this.hostPeerId) {
      return new Response(json({ type: 'error', code: 'host_exists', message: 'Host already exists in this room' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (role === 'client' && !this.hostPeerId) {
      return new Response(json({ type: 'error', code: 'host_missing', message: 'Host is not connected yet' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    }

    const pair = new WebSocketPair();
    const [clientWs, serverWs] = Object.values(pair);
    serverWs.accept();

    const peer: PeerInfo = {
      id: peerId,
      role,
      ws: serverWs,
    };

    if (role === 'host') {
      this.hostPeerId = peerId;
    } else {
      this.nextTankIndex += 1;
      peer.tankId = `player_${this.nextTankIndex}`;
    }

    this.peers.set(peerId, peer);

    serverWs.addEventListener('message', (event) => {
      this.handleMessage(peerId, String(event.data));
    });

    const onClose = () => {
      this.handleLeave(peerId);
    };
    serverWs.addEventListener('close', onClose);
    serverWs.addEventListener('error', onClose);

    this.sendJoined(peer);

    if (role === 'client' && peer.tankId) {
      this.broadcastToOthers(peerId, {
        type: 'peer_joined',
        peerId,
        tankId: peer.tankId,
      });
    }

    return new Response(null, { status: 101, webSocket: clientWs });
  }

  private sendJoined(peer: PeerInfo): void {
    if (peer.role === 'host') {
      const peers = Array.from(this.peers.values())
        .filter((p) => p.role === 'client' && p.tankId)
        .map((p) => ({ peerId: p.id, tankId: p.tankId! }));

      peer.ws.send(json({
        type: 'joined',
        selfId: peer.id,
        role: 'host',
        tankId: 'player_0',
        peers,
      }));
      return;
    }

    peer.ws.send(json({
      type: 'joined',
      selfId: peer.id,
      role: 'client',
      hostId: this.hostPeerId ?? undefined,
      tankId: peer.tankId,
    }));
  }

  private handleMessage(fromPeerId: string, raw: string): void {
    let packet: ClientToServer;
    try {
      packet = JSON.parse(raw) as ClientToServer;
    } catch {
      return;
    }

    const sender = this.peers.get(fromPeerId);
    if (!sender) return;

    if (packet.type === 'state') {
      if (sender.role !== 'host') return;
      this.broadcastToRole('client', {
        type: 'state',
        fromPeerId,
        serialized: packet.serialized,
      });
      return;
    }

    if (packet.type === 'reliable') {
      if (sender.role === 'host') {
        if (packet.targetPeerId) {
          this.sendToPeer(packet.targetPeerId, {
            type: 'reliable',
            fromPeerId,
            msg: packet.msg,
          });
          return;
        }

        this.broadcastToRole('client', {
          type: 'reliable',
          fromPeerId,
          msg: packet.msg,
        });
        return;
      }

      if (!this.hostPeerId) return;
      this.sendToPeer(this.hostPeerId, {
        type: 'reliable',
        fromPeerId,
        msg: packet.msg,
      });
    }
  }

  private handleLeave(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    this.peers.delete(peerId);

    if (peer.role === 'host') {
      this.hostPeerId = null;
      for (const client of this.peers.values()) {
        client.ws.send(json({
          type: 'error',
          code: 'host_disconnected',
          message: 'Host disconnected',
        }));
        client.ws.close(1011, 'host disconnected');
      }
      this.peers.clear();
      this.nextTankIndex = 0;
      return;
    }

    this.broadcastToOthers(peerId, {
      type: 'peer_left',
      peerId,
      tankId: peer.tankId,
    });
  }

  private sendToPeer(peerId: string, packet: ServerToClient): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.ws.send(json(packet));
  }

  private broadcastToRole(role: Role, packet: ServerToClient): void {
    for (const peer of this.peers.values()) {
      if (peer.role === role) {
        peer.ws.send(json(packet));
      }
    }
  }

  private broadcastToOthers(excludedPeerId: string, packet: ServerToClient): void {
    for (const peer of this.peers.values()) {
      if (peer.id !== excludedPeerId) {
        peer.ws.send(json(packet));
      }
    }
  }
}
