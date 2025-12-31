import AsyncStorage from '@react-native-async-storage/async-storage';
import nacl from 'tweetnacl';
import { bytesToBase64, base64ToBytes } from '../types';
import { encrypt, decrypt } from '../crypto';
import {
  DeviceKeys,
  MembershipHead,
  EventHead,
  VerifiedMember,
  PendingEntry,
  hexToBytes,
  bytesToHex,
} from './types';
import {
  generateSignKeyPair,
  generateBoxKeyPair,
  computeDeviceId,
} from './crypto';

const SYNC_KEYS = {
  VAULT_ID: 'sync_vault_id',
  DEVICE_ID: 'sync_device_id',
  PUBKEY_SIGN: 'sync_pubkey_sign',
  PRIVKEY_SIGN_ENC: 'sync_privkey_sign_enc',
  PUBKEY_BOX: 'sync_pubkey_box',
  PRIVKEY_BOX_ENC: 'sync_privkey_box_enc',
  VAULT_KEY_ENC: 'sync_vault_key_enc',
  KEY_EPOCH: 'sync_key_epoch',
  OWNER_DEVICE_ID: 'sync_owner_device_id',
  MEMBER_SEQ: 'sync_member_seq',
  MEMBER_HEAD_HASH: 'sync_member_head_hash',
  SYNC_CURSOR: 'sync_cursor',
  LAMPORT: 'sync_lamport',
  SERVER_URL: 'sync_server_url',
  VERIFIED_MEMBERS: 'sync_verified_members',
  EVENT_HEADS: 'sync_event_heads',
  PENDING_ENTRIES: 'sync_pending_entries',
  SCHEME_CUTOVER: 'sync_scheme_cutover',
  LEGACY_SEEDED: 'sync_legacy_seeded',
  ENTRY_SCHEMES: 'sync_entry_schemes',
};

export class SyncState {
  private vaultKey: Uint8Array | null = null;

  setVaultKey(key: Uint8Array): void {
    this.vaultKey = new Uint8Array(key);
  }

  clearVaultKey(): void {
    if (this.vaultKey) {
      this.vaultKey.fill(0);
      this.vaultKey = null;
    }
  }

  private getVaultKey(): Uint8Array {
    if (!this.vaultKey) {
      throw new Error('Sync state not initialized');
    }
    return this.vaultKey;
  }

  async isConfigured(): Promise<boolean> {
    const vaultId = await AsyncStorage.getItem(SYNC_KEYS.VAULT_ID);
    const deviceId = await AsyncStorage.getItem(SYNC_KEYS.DEVICE_ID);
    return vaultId !== null && deviceId !== null;
  }

  async hasDeviceKeys(): Promise<boolean> {
    const deviceId = await AsyncStorage.getItem(SYNC_KEYS.DEVICE_ID);
    return deviceId !== null;
  }

  async getVaultId(): Promise<string | null> {
    return AsyncStorage.getItem(SYNC_KEYS.VAULT_ID);
  }

  async setVaultId(vaultId: string): Promise<void> {
    await AsyncStorage.setItem(SYNC_KEYS.VAULT_ID, vaultId);
  }

  async getDeviceKeys(): Promise<DeviceKeys | null> {
    const vaultKey = this.getVaultKey();

    const deviceIdHex = await AsyncStorage.getItem(SYNC_KEYS.DEVICE_ID);
    if (!deviceIdHex) return null;

    const pubkeySignB64 = await AsyncStorage.getItem(SYNC_KEYS.PUBKEY_SIGN);
    const privkeySignEncB64 = await AsyncStorage.getItem(SYNC_KEYS.PRIVKEY_SIGN_ENC);
    const pubkeyBoxB64 = await AsyncStorage.getItem(SYNC_KEYS.PUBKEY_BOX);
    const privkeyBoxEncB64 = await AsyncStorage.getItem(SYNC_KEYS.PRIVKEY_BOX_ENC);

    if (!pubkeySignB64 || !privkeySignEncB64 || !pubkeyBoxB64 || !privkeyBoxEncB64) {
      return null;
    }

    const pubkeySign = base64ToBytes(pubkeySignB64);
    const privkeySignEnc = base64ToBytes(privkeySignEncB64);
    const pubkeyBox = base64ToBytes(pubkeyBoxB64);
    const privkeyBoxEnc = base64ToBytes(privkeyBoxEncB64);

    const privkeySign = decrypt(vaultKey, privkeySignEnc);
    const privkeyBox = decrypt(vaultKey, privkeyBoxEnc);

    if (!privkeySign || !privkeyBox) {
      return null;
    }

    return {
      deviceId: deviceIdHex,
      pubkeySign,
      privkeySign,
      pubkeyBox,
      privkeyBox,
    };
  }

  async setDeviceKeys(keys: DeviceKeys): Promise<void> {
    const vaultKey = this.getVaultKey();

    const privkeySignEnc = encrypt(vaultKey, keys.privkeySign);
    const privkeyBoxEnc = encrypt(vaultKey, keys.privkeyBox);

    await AsyncStorage.multiSet([
      [SYNC_KEYS.DEVICE_ID, keys.deviceId],
      [SYNC_KEYS.PUBKEY_SIGN, bytesToBase64(keys.pubkeySign)],
      [SYNC_KEYS.PRIVKEY_SIGN_ENC, bytesToBase64(privkeySignEnc)],
      [SYNC_KEYS.PUBKEY_BOX, bytesToBase64(keys.pubkeyBox)],
      [SYNC_KEYS.PRIVKEY_BOX_ENC, bytesToBase64(privkeyBoxEnc)],
    ]);
  }

  async clearDeviceKeys(): Promise<void> {
    await AsyncStorage.multiRemove([
      SYNC_KEYS.DEVICE_ID,
      SYNC_KEYS.PUBKEY_SIGN,
      SYNC_KEYS.PRIVKEY_SIGN_ENC,
      SYNC_KEYS.PUBKEY_BOX,
      SYNC_KEYS.PRIVKEY_BOX_ENC,
    ]);
  }

  async getSyncVaultKey(): Promise<Uint8Array | null> {
    const vaultKey = this.getVaultKey();
    const vaultKeyEncB64 = await AsyncStorage.getItem(SYNC_KEYS.VAULT_KEY_ENC);
    if (!vaultKeyEncB64) return null;

    const vaultKeyEnc = base64ToBytes(vaultKeyEncB64);
    const decrypted = decrypt(vaultKey, vaultKeyEnc);
    return decrypted;
  }

  async setSyncVaultKey(syncVaultKey: Uint8Array): Promise<void> {
    const vaultKey = this.getVaultKey();
    const encrypted = encrypt(vaultKey, syncVaultKey);
    await AsyncStorage.setItem(SYNC_KEYS.VAULT_KEY_ENC, bytesToBase64(encrypted));
  }

  async getKeyEpoch(): Promise<number> {
    const val = await AsyncStorage.getItem(SYNC_KEYS.KEY_EPOCH);
    return val ? parseInt(val, 10) : 1;
  }

  async setKeyEpoch(epoch: number): Promise<void> {
    await AsyncStorage.setItem(SYNC_KEYS.KEY_EPOCH, epoch.toString());
  }

  async getOwnerDeviceId(): Promise<string | null> {
    return AsyncStorage.getItem(SYNC_KEYS.OWNER_DEVICE_ID);
  }

  async setOwnerDeviceId(deviceId: string): Promise<void> {
    await AsyncStorage.setItem(SYNC_KEYS.OWNER_DEVICE_ID, deviceId);
  }

  async getMembershipHead(): Promise<MembershipHead | null> {
    const memberSeqStr = await AsyncStorage.getItem(SYNC_KEYS.MEMBER_SEQ);
    const memberHeadHashB64 = await AsyncStorage.getItem(SYNC_KEYS.MEMBER_HEAD_HASH);

    if (!memberSeqStr || !memberHeadHashB64) return null;

    return {
      memberSeq: parseInt(memberSeqStr, 10),
      memberHeadHash: base64ToBytes(memberHeadHashB64),
    };
  }

  async setMembershipHead(head: MembershipHead): Promise<void> {
    await AsyncStorage.multiSet([
      [SYNC_KEYS.MEMBER_SEQ, head.memberSeq.toString()],
      [SYNC_KEYS.MEMBER_HEAD_HASH, bytesToBase64(head.memberHeadHash)],
    ]);
  }

  async getSyncCursor(): Promise<number> {
    const val = await AsyncStorage.getItem(SYNC_KEYS.SYNC_CURSOR);
    return val ? parseInt(val, 10) : 0;
  }

  async setSyncCursor(cursor: number): Promise<void> {
    await AsyncStorage.setItem(SYNC_KEYS.SYNC_CURSOR, cursor.toString());
  }

  async getLamport(): Promise<number> {
    const val = await AsyncStorage.getItem(SYNC_KEYS.LAMPORT);
    return val ? parseInt(val, 10) : 0;
  }

  async setLamport(lamport: number): Promise<void> {
    await AsyncStorage.setItem(SYNC_KEYS.LAMPORT, lamport.toString());
  }

  async incrementLamport(): Promise<number> {
    const current = await this.getLamport();
    const next = current + 1;
    await this.setLamport(next);
    return next;
  }

  async updateLamport(received: number): Promise<number> {
    const current = await this.getLamport();
    const next = Math.max(current, received);
    await this.setLamport(next);
    return next;
  }

  async getServerURL(): Promise<string | null> {
    return AsyncStorage.getItem(SYNC_KEYS.SERVER_URL);
  }

  async setServerURL(url: string): Promise<void> {
    await AsyncStorage.setItem(SYNC_KEYS.SERVER_URL, url);
  }

  async getSchemeCutover(): Promise<Date | null> {
    const val = await AsyncStorage.getItem(SYNC_KEYS.SCHEME_CUTOVER);
    if (!val) return null;
    const parsed = new Date(val);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  async setSchemeCutover(cutover: Date): Promise<void> {
    await AsyncStorage.setItem(SYNC_KEYS.SCHEME_CUTOVER, cutover.toISOString());
  }

  async ensureSchemeCutover(): Promise<Date> {
    const existing = await this.getSchemeCutover();
    if (existing) return existing;
    const now = new Date();
    await this.setSchemeCutover(now);
    return now;
  }

  async getLegacySeeded(): Promise<boolean> {
    const val = await AsyncStorage.getItem(SYNC_KEYS.LEGACY_SEEDED);
    return val === 'true';
  }

  async setLegacySeeded(seeded: boolean): Promise<void> {
    await AsyncStorage.setItem(SYNC_KEYS.LEGACY_SEEDED, seeded ? 'true' : 'false');
  }

  async getVerifiedMembers(): Promise<VerifiedMember[]> {
    const data = await AsyncStorage.getItem(SYNC_KEYS.VERIFIED_MEMBERS);
    if (!data) return [];

    try {
      const parsed = JSON.parse(data);
      return parsed.map((m: Record<string, unknown>) => ({
        deviceId: m.deviceId as string,
        pubkeySign: base64ToBytes(m.pubkeySign as string),
        pubkeyBox: base64ToBytes(m.pubkeyBox as string),
        keyEpoch: m.keyEpoch as number,
      }));
    } catch {
      return [];
    }
  }

  async getEntrySchemes(): Promise<Record<string, string>> {
    const data = await AsyncStorage.getItem(SYNC_KEYS.ENTRY_SCHEMES);
    if (!data) return {};

    try {
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed as Record<string, string>;
    } catch {
      return {};
    }
  }

  async getEntryScheme(entryId: string): Promise<string | null> {
    if (!entryId) return null;
    const schemes = await this.getEntrySchemes();
    return schemes[entryId] || null;
  }

  async setEntryScheme(entryId: string, scheme: string): Promise<void> {
    if (!entryId) return;
    const schemes = await this.getEntrySchemes();
    schemes[entryId] = scheme;
    await AsyncStorage.setItem(SYNC_KEYS.ENTRY_SCHEMES, JSON.stringify(schemes));
  }

  async removeEntryScheme(entryId: string): Promise<void> {
    if (!entryId) return;
    const schemes = await this.getEntrySchemes();
    delete schemes[entryId];
    await AsyncStorage.setItem(SYNC_KEYS.ENTRY_SCHEMES, JSON.stringify(schemes));
  }

  async clearEntrySchemes(): Promise<void> {
    await AsyncStorage.setItem(SYNC_KEYS.ENTRY_SCHEMES, '{}');
  }

  async getVerifiedMember(deviceId: string): Promise<VerifiedMember | null> {
    const members = await this.getVerifiedMembers();
    return members.find((m) => m.deviceId === deviceId) || null;
  }

  async setVerifiedMember(member: VerifiedMember): Promise<void> {
    const members = await this.getVerifiedMembers();
    const index = members.findIndex((m) => m.deviceId === member.deviceId);

    if (index >= 0) {
      members[index] = member;
    } else {
      members.push(member);
    }

    const serialized = members.map((m) => ({
      deviceId: m.deviceId,
      pubkeySign: bytesToBase64(m.pubkeySign),
      pubkeyBox: bytesToBase64(m.pubkeyBox),
      keyEpoch: m.keyEpoch,
    }));

    await AsyncStorage.setItem(SYNC_KEYS.VERIFIED_MEMBERS, JSON.stringify(serialized));
  }

  async removeVerifiedMember(deviceId: string): Promise<void> {
    const members = await this.getVerifiedMembers();
    const filtered = members.filter((m) => m.deviceId !== deviceId);

    const serialized = filtered.map((m) => ({
      deviceId: m.deviceId,
      pubkeySign: bytesToBase64(m.pubkeySign),
      pubkeyBox: bytesToBase64(m.pubkeyBox),
      keyEpoch: m.keyEpoch,
    }));

    await AsyncStorage.setItem(SYNC_KEYS.VERIFIED_MEMBERS, JSON.stringify(serialized));
  }

  async clearVerifiedMembers(): Promise<void> {
    await AsyncStorage.setItem(SYNC_KEYS.VERIFIED_MEMBERS, '[]');
  }

  async getEventHead(deviceId: string): Promise<EventHead> {
    const data = await AsyncStorage.getItem(SYNC_KEYS.EVENT_HEADS);
    if (!data) {
      return { lastCounter: 0, lastHash: new Uint8Array(32) };
    }

    try {
      const parsed = JSON.parse(data);
      const entry = parsed[deviceId];
      if (!entry) {
        return { lastCounter: 0, lastHash: new Uint8Array(32) };
      }

      return {
        lastCounter: entry.lastCounter,
        lastHash: base64ToBytes(entry.lastHash),
      };
    } catch {
      return { lastCounter: 0, lastHash: new Uint8Array(32) };
    }
  }

  async setEventHead(deviceId: string, head: EventHead): Promise<void> {
    const data = await AsyncStorage.getItem(SYNC_KEYS.EVENT_HEADS);
    let parsed: Record<string, { lastCounter: number; lastHash: string }> = {};

    if (data) {
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = {};
      }
    }

    parsed[deviceId] = {
      lastCounter: head.lastCounter,
      lastHash: bytesToBase64(head.lastHash),
    };

    await AsyncStorage.setItem(SYNC_KEYS.EVENT_HEADS, JSON.stringify(parsed));
  }

  async clearEventHeads(): Promise<void> {
    await AsyncStorage.setItem(SYNC_KEYS.EVENT_HEADS, '{}');
  }

  async addPendingEntry(op: 'upsert' | 'delete', entry: PendingEntry['entry']): Promise<void> {
    const vaultKey = this.getVaultKey();
    const data = await AsyncStorage.getItem(SYNC_KEYS.PENDING_ENTRIES);
    let pending: Record<string, string> = {};

    if (data) {
      try {
        pending = JSON.parse(data);
      } catch {
        pending = {};
      }
    }

    const plaintext = new TextEncoder().encode(JSON.stringify({ op, entry }));
    const encrypted = encrypt(vaultKey, plaintext);
    pending[entry.id] = bytesToBase64(encrypted);

    await AsyncStorage.setItem(SYNC_KEYS.PENDING_ENTRIES, JSON.stringify(pending));
  }

  async removePendingEntry(entryId: string): Promise<void> {
    const data = await AsyncStorage.getItem(SYNC_KEYS.PENDING_ENTRIES);
    if (!data) return;

    try {
      const pending = JSON.parse(data);
      delete pending[entryId];
      await AsyncStorage.setItem(SYNC_KEYS.PENDING_ENTRIES, JSON.stringify(pending));
    } catch { }
  }

  async getPendingEntries(): Promise<PendingEntry[]> {
    const vaultKey = this.getVaultKey();
    const data = await AsyncStorage.getItem(SYNC_KEYS.PENDING_ENTRIES);
    if (!data) return [];

    try {
      const pending: Record<string, string> = JSON.parse(data);
      const result: PendingEntry[] = [];

      for (const encryptedB64 of Object.values(pending)) {
        const encrypted = base64ToBytes(encryptedB64);
        const decrypted = decrypt(vaultKey, encrypted);
        if (decrypted) {
          const parsed = JSON.parse(new TextDecoder().decode(decrypted));
          result.push(parsed);
        }
      }

      return result;
    } catch {
      return [];
    }
  }

  async clearPendingEntries(): Promise<void> {
    await AsyncStorage.setItem(SYNC_KEYS.PENDING_ENTRIES, '{}');
  }

  async clearVaultState(): Promise<void> {
    const keysToRemove = [
      SYNC_KEYS.VAULT_ID,
      SYNC_KEYS.VAULT_KEY_ENC,
      SYNC_KEYS.KEY_EPOCH,
      SYNC_KEYS.OWNER_DEVICE_ID,
      SYNC_KEYS.MEMBER_SEQ,
      SYNC_KEYS.MEMBER_HEAD_HASH,
      SYNC_KEYS.SYNC_CURSOR,
      SYNC_KEYS.LAMPORT,
      SYNC_KEYS.VERIFIED_MEMBERS,
      SYNC_KEYS.EVENT_HEADS,
      SYNC_KEYS.PENDING_ENTRIES,
      SYNC_KEYS.SCHEME_CUTOVER,
      SYNC_KEYS.LEGACY_SEEDED,
      SYNC_KEYS.ENTRY_SCHEMES,
    ];

    await AsyncStorage.multiRemove(keysToRemove);
  }

  async clearAllSyncState(): Promise<void> {
    const allKeys = Object.values(SYNC_KEYS);
    await AsyncStorage.multiRemove(allKeys);
  }
}

export async function generateDeviceKeys(): Promise<DeviceKeys> {
  const signKeyPair = generateSignKeyPair();
  const boxKeyPair = generateBoxKeyPair();

  const deviceId = computeDeviceId(signKeyPair.publicKey);

  return {
    deviceId,
    pubkeySign: signKeyPair.publicKey,
    privkeySign: signKeyPair.secretKey,
    pubkeyBox: boxKeyPair.publicKey,
    privkeyBox: boxKeyPair.secretKey,
  };
}

export const syncState = new SyncState();
