import { v4 as uuidv4, parse as uuidParse } from 'uuid';
import { bytesToBase64, base64ToBytes } from '../types';

export interface DeviceBundle {
  device_id: string;
  device_pubkey_sign: string;
  device_pubkey_box: string;
  device_bundle_sig: string;
}

export interface SyncEvent {
  msg_type: 'event';
  event_id: string;
  vault_id: string;
  device_id: string;
  counter: string;
  lamport: string;
  key_epoch: string;
  prev_hash: string;
  nonce: string;
  ciphertext: string;
  signature: string;
  seq?: string;
  created_at?: string;
}

export interface MemberEvent {
  msg_type: 'member_add' | 'member_remove';
  member_event_id: string;
  vault_id: string;
  member_seq: string;
  prev_hash: string;
  actor_device_id: string;
  subject_device_id: string;
  subject_pubkey_sign?: string;
  subject_pubkey_box?: string;
  subject_bundle_sig?: string;
  invite_id?: string;
  claim_sig?: string;
  signature: string;
  created_at?: string;
}

export interface Invite {
  msg_type: 'invite';
  invite_id: string;
  vault_id: string;
  target_device_id: string;
  target_device_pubkey_sign: string;
  target_device_pubkey_box: string;
  target_device_bundle_sig: string;
  nonce: string;
  wrapped_payload: string;
  created_by_device_id: string;
  single_use: boolean;
  signature: string;
  created_at?: string;
}

export interface InviteClaim {
  msg_type: 'invite_claim';
  invite_id: string;
  vault_id: string;
  device_id: string;
  signature: string;
  created_at?: string;
}

export interface KeyUpdate {
  msg_type: 'key_update';
  key_update_id: string;
  vault_id: string;
  member_seq: string;
  member_head_hash: string;
  target_device_id: string;
  key_epoch: string;
  nonce: string;
  wrapped_payload: string;
  created_by_device_id: string;
  signature: string;
  created_at?: string;
}

export interface KeyUpdateAck {
  msg_type: 'key_update_ack';
  vault_id: string;
  device_id: string;
  key_epoch: string;
  member_seq: string;
  member_head_hash: string;
  signature: string;
  created_at?: string;
}

export interface Snapshot {
  msg_type: 'snapshot';
  snapshot_id: string;
  vault_id: string;
  base_seq: string;
  member_seq: string;
  member_head_hash: string;
  base_counter_map: string;
  head_hash_map: string;
  lamport_at_snapshot: string;
  key_epoch: string;
  nonce: string;
  ciphertext: string;
  signature: string;
  created_by_device_id: string;
  created_at?: string;
}

export interface VaultMember {
  device_id: string;
  device_pubkey_sign: string;
  device_pubkey_box: string;
  key_epoch: string;
}

export interface VaultMembershipResponse {
  member_seq: string;
  head_hash: string;
  members: VaultMember[];
}

export interface EventResponse {
  seq: string;
}

export interface DeviceKeys {
  deviceId: string;
  pubkeySign: Uint8Array;
  privkeySign: Uint8Array;
  pubkeyBox: Uint8Array;
  privkeyBox: Uint8Array;
}

export interface MembershipHead {
  memberSeq: number;
  memberHeadHash: Uint8Array;
}

export interface EventHead {
  lastCounter: number;
  lastHash: Uint8Array;
}

export interface VerifiedMember {
  deviceId: string;
  pubkeySign: Uint8Array;
  pubkeyBox: Uint8Array;
  keyEpoch: number;
}

export interface PendingEntry {
  op: 'upsert' | 'delete';
  entry: {
    id: string;
    website: string;
    username: string;
    password: string;
    notes: string;
    tags?: string[];
    updated_at: string;
  };
}

export interface SyncStatus {
  status: 'disconnected' | 'syncing' | 'synced' | 'error';
  lastSync?: Date;
  memberCount?: number;
  pendingCount?: number;
  errorMessage?: string;
}

export function newUUID(): string {
  return uuidv4();
}

export function parseUUID(s: string): string {
  const parsed = uuidParse(s);
  if (parsed.length !== 16) {
    throw new Error('Invalid UUID');
  }
  return s.toLowerCase();
}

export function uuidToBytes(uuid: string): Uint8Array {
  return new Uint8Array(uuidParse(uuid));
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function validateDeviceId(deviceId: string): boolean {
  if (deviceId.length !== 64) {
    return false;
  }
  try {
    hexToBytes(deviceId);
    return true;
  } catch {
    return false;
  }
}

export const ZERO_UUID = new Uint8Array(16);
export const ZERO32 = new Uint8Array(32);
export const ZERO64 = new Uint8Array(64);

export const NONCE_LENGTH = 24;
export const HASH_LENGTH = 32;
export const SIGNATURE_LENGTH = 64;
export const PUBLIC_KEY_LENGTH = 32;
export const DEVICE_ID_LENGTH = 64;
