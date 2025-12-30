export interface Entry {
  id: string;
  website: string;
  username: string;
  password: string;
  notes: string;
  tags?: string[];
  updated_at: string;
}

export interface Friend {
  fingerprint: string;
  name: string;
  pubkey: string;
  added_at: string;
  last_addr?: string;
}

export interface Device {
  name: string;
  pubkey: string;
  privkey: string;
}

export interface Peer {
  name: string;
  fingerprint: string;
  host: string;
  port: number;
  pubkey: string;
  isPaired: boolean;
}

export interface ShareMessage {
  from_fingerprint: string;
  ciphertext: string;
}

export interface WhoAmIResponse {
  device_name: string;
  pubkey: string;
  fingerprint: string;
  version: string;
}

export interface IncomingShare {
  fromFingerprint: string;
  fromName: string;
  entry: Entry;
}

export interface VaultData {
  entries: Entry[];
  friends: Friend[];
  device: Device;
}

import nacl from 'tweetnacl';

export function createEntry(
  website: string,
  username: string,
  password: string,
  notes: string,
  tags: string[] = []
): Entry {
  return {
    id: generateId(),
    website,
    username,
    password,
    notes,
    tags,
    updated_at: new Date().toISOString(),
  };
}

export function generateId(): string {
  const bytes = nacl.randomBytes(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateRandomBytes(length: number): Uint8Array {
  return nacl.randomBytes(length);
}

export function computeFingerprint(pubkeyBase64: string): string {
  const bytes = base64ToBytes(pubkeyBase64);
  if (bytes.length < 8) return '';
  return Array.from(bytes.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
