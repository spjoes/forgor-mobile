import { NativeModules } from 'react-native';
import Constants from 'expo-constants';
import { vaultStore } from './storage';
import { IncomingShare, base64ToBytes } from './types';
import { decryptIncomingShare } from './sharing';

const HEADER_END = '\r\n\r\n';

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  202: 'Accepted',
  400: 'Bad Request',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

type IncomingShareHandler = (share: IncomingShare) => void;
type TcpSocketModule = typeof import('react-native-tcp-socket').default;
type TcpSocketExport = TcpSocketModule & { default?: TcpSocketModule };
type TcpSocket = Parameters<NonNullable<Parameters<TcpSocketModule['createServer']>[1]>>[0];

declare const require: (moduleId: string) => unknown;

export type ServerStatus = {
  state: 'running' | 'stopped' | 'unavailable' | 'error';
  detail: string;
};

type RequestState = {
  method: string;
  path: string;
  bodyStart: number;
  contentLength: number;
};

class HttpServer {
  private tcpSocket: TcpSocketModule | null = null;
  private server: ReturnType<TcpSocketModule['createServer']> | null = null;
  private isRunning = false;
  private warnedUnavailable = false;
  private onIncomingShare: IncomingShareHandler | null = null;
  private connections = new Set<TcpSocket>();
  private lastError: string | null = null;

  private isAvailable(): boolean {
    return !!NativeModules?.TcpSockets;
  }

  private warnIfUnavailable(): void {
    if (this.warnedUnavailable) return;
    this.warnedUnavailable = true;
    console.warn('TCP server unavailable. Incoming sharing is disabled (Expo Go or missing native module).');
  }

  private getUnavailableDetail(): string {
    const ownership = Constants?.appOwnership;
    if (ownership === 'expo') {
      return 'Cannot run incoming sharing server in Expo Go.';
    }
    return 'Native TCP socket module is not available.';
  }

  getStatus(): ServerStatus {
    if (!this.isAvailable()) {
      return { state: 'unavailable', detail: this.getUnavailableDetail() };
    }
    if (this.lastError) {
      return { state: 'error', detail: `Server error: ${this.lastError}` };
    }
    if (this.isRunning) {
      return { state: 'running', detail: 'Incoming sharing is enabled.' };
    }
    return { state: 'stopped', detail: 'Incoming sharing is not running.' };
  }

  private getTcpSocket(): TcpSocketModule | null {
    if (this.tcpSocket) {
      return this.tcpSocket;
    }
    if (!this.isAvailable()) {
      this.warnIfUnavailable();
      return null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loaded = require('react-native-tcp-socket') as TcpSocketExport;
      const resolved = (loaded.default ?? loaded) as TcpSocketModule;
      if (typeof resolved.createServer !== 'function') {
        this.warnIfUnavailable();
        return null;
      }
      this.tcpSocket = resolved;
      return resolved;
    } catch (err) {
      console.warn('Failed to load TCP socket module:', err);
      this.warnIfUnavailable();
      return null;
    }
  }

  start(port: number, onIncomingShare: IncomingShareHandler): void {
    if (this.isRunning) return;
    const tcpSocket = this.getTcpSocket();
    if (!tcpSocket) return;

    this.lastError = null;
    this.onIncomingShare = onIncomingShare;
    this.server = tcpSocket.createServer((socket: TcpSocket) => this.handleConnection(socket));
    this.server.on('error', (err: Error) => {
      console.warn('HTTP server error:', err);
      this.lastError = err.message;
      this.isRunning = false;
    });
    this.server.listen({ port, host: '0.0.0.0', reuseAddress: true }, () => {
      this.isRunning = true;
    });
  }

  stop(): void {
    if (!this.server) return;
    this.server.close(() => {});
    this.server = null;
    this.isRunning = false;
    this.onIncomingShare = null;
    this.lastError = null;
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();
  }

  private handleConnection(socket: TcpSocket): void {
    this.connections.add(socket);
    socket.setEncoding('utf8');

    let buffer = '';
    let request: RequestState | null = null;
    let handled = false;

    const tryHandle = async () => {
      if (handled) return;

      if (!request) {
        const headerEnd = buffer.indexOf(HEADER_END);
        if (headerEnd === -1) return;

        const headerText = buffer.slice(0, headerEnd);
        const lines = headerText.split('\r\n');
        const requestLine = lines[0]?.split(' ') ?? [];
        const method = requestLine[0];
        const path = requestLine[1];

        if (!method || !path) {
          handled = true;
          this.sendText(socket, 400, 'Invalid request');
          return;
        }

        const headers: Record<string, string> = {};
        for (const line of lines.slice(1)) {
          const idx = line.indexOf(':');
          if (idx === -1) continue;
          const key = line.slice(0, idx).trim().toLowerCase();
          const value = line.slice(idx + 1).trim();
          headers[key] = value;
        }

        const contentLength = parseInt(headers['content-length'] || '0', 10) || 0;
        request = {
          method: method.toUpperCase(),
          path,
          bodyStart: headerEnd + HEADER_END.length,
          contentLength,
        };
      }

      if (!request) return;
      if (buffer.length < request.bodyStart + request.contentLength) return;

      handled = true;
      const body = buffer.slice(request.bodyStart, request.bodyStart + request.contentLength);
      await this.handleRequest(request.method, request.path, body, socket);
    };

    socket.on('data', (data: string | Buffer) => {
      buffer += typeof data === 'string' ? data : data.toString('utf8');
      void tryHandle();
    });

    socket.on('error', (err: Error) => {
      console.warn('HTTP socket error:', err);
      socket.destroy();
    });

    socket.on('close', () => {
      this.connections.delete(socket);
    });
  }

  private async handleRequest(
    method: string,
    path: string,
    body: string,
    socket: TcpSocket
  ): Promise<void> {
    const cleanPath = path.split('?')[0];

    try {
      if (cleanPath === '/whoami') {
        if (method !== 'GET') {
          this.sendText(socket, 405, 'Method not allowed');
          return;
        }

        const device = await vaultStore.getDevice();
        if (!device) {
          this.sendText(socket, 503, 'Vault is locked');
          return;
        }

        const response = {
          device_name: device.name,
          pubkey: Array.from(base64ToBytes(device.pubkey)),
          fingerprint: vaultStore.getDeviceFingerprint(device),
          version: '1',
        };
        this.sendJson(socket, 200, response);
        return;
      }

      if (cleanPath === '/share') {
        if (method !== 'POST') {
          this.sendText(socket, 405, 'Method not allowed');
          return;
        }

        const device = await vaultStore.getDevice();
        if (!device) {
          this.sendText(socket, 503, 'Vault is locked');
          return;
        }

        let payload: { from_fingerprint?: string; ciphertext?: string } | null = null;
        try {
          payload = JSON.parse(body);
        } catch {
          this.sendText(socket, 400, 'Invalid JSON');
          return;
        }

        const fromFingerprint = payload?.from_fingerprint;
        const ciphertext = payload?.ciphertext;
        if (!fromFingerprint || typeof ciphertext !== 'string') {
          this.sendText(socket, 400, 'Invalid share');
          return;
        }

        const friend = await vaultStore.getFriend(fromFingerprint);
        if (!friend) {
          this.sendText(socket, 403, 'Sender not paired');
          return;
        }

        let entry = null;
        try {
          entry = decryptIncomingShare(ciphertext, friend.pubkey, device);
        } catch {
          entry = null;
        }

        if (!entry) {
          this.sendText(socket, 400, 'Decryption failed');
          return;
        }

        const incoming: IncomingShare = {
          fromFingerprint,
          fromName: friend.name,
          entry,
        };

        this.onIncomingShare?.(incoming);
        this.sendJson(socket, 202, { status: 'pending' });
        return;
      }

      this.sendText(socket, 404, 'Not found');
    } catch (err) {
      console.warn('HTTP handler error:', err);
      this.sendText(socket, 500, 'Internal server error');
    }
  }

  private sendJson(socket: TcpSocket, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    this.sendResponse(socket, status, body, 'application/json');
  }

  private sendText(socket: TcpSocket, status: number, message: string): void {
    this.sendResponse(socket, status, message, 'text/plain');
  }

  private sendResponse(
    socket: TcpSocket,
    status: number,
    body: string,
    contentType: string
  ): void {
    const encoder = new TextEncoder();
    const bodyBytes = encoder.encode(body);
    const statusText = STATUS_TEXT[status] || 'OK';
    const response =
      `HTTP/1.1 ${status} ${statusText}\r\n` +
      `Content-Type: ${contentType}\r\n` +
      `Content-Length: ${bodyBytes.length}\r\n` +
      'Connection: close\r\n' +
      '\r\n' +
      body;

    socket.write(response);
    socket.end();
  }
}

export const httpServer = new HttpServer();
