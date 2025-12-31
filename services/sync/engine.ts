import nacl from 'tweetnacl';
import { Entry } from '../types';
import { bytesToBase64, base64ToBytes } from '../types';
import { SyncClient, APIError } from './client';
import { SyncState, generateDeviceKeys } from './state';
import {
  DeviceBundle,
  SyncEvent,
  MemberEvent,
  Invite,
  InviteClaim,
  DeviceKeys,
  newUUID,
  uuidToBytes,
  hexToBytes,
  bytesToHex,
  ZERO_UUID,
  ZERO64,
} from './types';
import {
  sign,
  verify,
  sha256,
  boxSeal,
  boxOpen,
  deriveEventKey,
  deriveLegacyEventKey,
  xchacha20poly1305Encrypt,
  xchacha20poly1305Decrypt,
} from './crypto';
import {
  signBytesDeviceBundle,
  signBytesEvent,
  signBytesMemberAdd,
  signBytesMemberRemove,
  signBytesInvite,
  signBytesInviteClaim,
} from './signbytes';

export class SyncEngine {
  private client: SyncClient;
  private state: SyncState;

  constructor(client: SyncClient, state: SyncState) {
    this.client = client;
    this.state = state;
  }

  async registerDevice(): Promise<void> {
    const keys = await this.state.getDeviceKeys();
    if (!keys) {
      throw new Error('Device keys not initialized');
    }

    const deviceIdBytes = hexToBytes(keys.deviceId);
    const signBytes = signBytesDeviceBundle(
      deviceIdBytes,
      keys.pubkeySign,
      keys.pubkeyBox
    );

    const signature = sign(keys.privkeySign, signBytes);

    const bundle: DeviceBundle = {
      device_id: keys.deviceId,
      device_pubkey_sign: bytesToBase64(keys.pubkeySign),
      device_pubkey_box: bytesToBase64(keys.pubkeyBox),
      device_bundle_sig: bytesToBase64(signature),
    };

    await this.client.registerDevice(bundle);
  }

  async createVault(): Promise<void> {
    const keys = await this.state.getDeviceKeys();
    if (!keys) {
      throw new Error('Device keys not initialized');
    }

    const vaultId = newUUID();
    const syncVaultKey = nacl.randomBytes(32);

    const memberEventId = newUUID();
    const memberSeq = 1;
    const prevHash = new Uint8Array(32);

    const deviceIdBytes = hexToBytes(keys.deviceId);

    const bundleSignBytes = signBytesDeviceBundle(
      deviceIdBytes,
      keys.pubkeySign,
      keys.pubkeyBox
    );
    const bundleSig = sign(keys.privkeySign, bundleSignBytes);

    const memberSignBytes = signBytesMemberAdd(
      uuidToBytes(memberEventId),
      uuidToBytes(vaultId),
      memberSeq,
      prevHash,
      deviceIdBytes,
      deviceIdBytes,
      ZERO_UUID,
      ZERO64,
      bundleSig,
      keys.pubkeySign,
      keys.pubkeyBox
    );

    const signature = sign(keys.privkeySign, memberSignBytes);

    const memberEvent: MemberEvent = {
      msg_type: 'member_add',
      member_event_id: memberEventId,
      vault_id: vaultId,
      member_seq: memberSeq.toString(),
      prev_hash: bytesToBase64(prevHash),
      actor_device_id: keys.deviceId,
      subject_device_id: keys.deviceId,
      subject_pubkey_sign: bytesToBase64(keys.pubkeySign),
      subject_pubkey_box: bytesToBase64(keys.pubkeyBox),
      subject_bundle_sig: bytesToBase64(bundleSig),
      invite_id: '00000000-0000-0000-0000-000000000000',
      claim_sig: bytesToBase64(ZERO64),
      signature: bytesToBase64(signature),
    };

    await this.client.createMemberEvent(vaultId, memberEvent);

    await this.state.setVaultId(vaultId);
    await this.state.setSyncVaultKey(syncVaultKey);
    await this.state.setKeyEpoch(1);
    await this.state.setOwnerDeviceId(keys.deviceId);

    const eventHash = sha256(memberSignBytes);
    await this.state.setMembershipHead({
      memberSeq,
      memberHeadHash: eventHash,
    });

    await this.state.setVerifiedMember({
      deviceId: keys.deviceId,
      pubkeySign: keys.pubkeySign,
      pubkeyBox: keys.pubkeyBox,
      keyEpoch: 1,
    });
  }

  async joinVault(inviteId: string): Promise<void> {
    const keys = await this.state.getDeviceKeys();
    if (!keys) {
      throw new Error('Device keys not initialized');
    }

    const invites = await this.client.getInvites(keys.deviceId);
    const invite = invites.find((i) => i.invite_id === inviteId);
    if (!invite) {
      throw new Error(`Invite not found: ${inviteId}`);
    }

    const creatorBundle = await this.client.getDevice(invite.created_by_device_id);
    const creatorPubBox = base64ToBytes(creatorBundle.device_pubkey_box);

    const nonce = base64ToBytes(invite.nonce);
    const wrappedPayload = base64ToBytes(invite.wrapped_payload);
    const combined = new Uint8Array(nonce.length + wrappedPayload.length);
    combined.set(nonce);
    combined.set(wrappedPayload, nonce.length);

    const decrypted = boxOpen(combined, creatorPubBox, keys.privkeyBox);
    if (!decrypted) {
      throw new Error('Failed to decrypt invite payload');
    }

    if (decrypted.length < 32) {
      throw new Error('Invalid invite payload length');
    }

    const syncVaultKey = decrypted.slice(0, 32);
    const deviceIdBytes = hexToBytes(keys.deviceId);

    const claimSignBytes = signBytesInviteClaim(
      uuidToBytes(inviteId),
      uuidToBytes(invite.vault_id),
      deviceIdBytes
    );
    const claimSig = sign(keys.privkeySign, claimSignBytes);

    const claim: InviteClaim = {
      msg_type: 'invite_claim',
      invite_id: inviteId,
      vault_id: invite.vault_id,
      device_id: keys.deviceId,
      signature: bytesToBase64(claimSig),
    };

    await this.client.claimInvite(inviteId, claim);

    await this.state.setVaultId(invite.vault_id);
    await this.state.setSyncVaultKey(syncVaultKey);
    await this.state.setKeyEpoch(1);

    const members = await this.client.getVaultMembers(invite.vault_id);

    const memberHeadHash = base64ToBytes(members.head_hash);
    await this.state.setMembershipHead({
      memberSeq: parseInt(members.member_seq, 10),
      memberHeadHash,
    });

    await this.state.clearVerifiedMembers();

    for (const member of members.members) {
      await this.state.setVerifiedMember({
        deviceId: member.device_id,
        pubkeySign: base64ToBytes(member.device_pubkey_sign),
        pubkeyBox: base64ToBytes(member.device_pubkey_box),
        keyEpoch: parseInt(member.key_epoch, 10),
      });
    }
  }

  async inviteDeviceById(targetDeviceId: string): Promise<string> {
    const targetBundle = await this.client.getDevice(targetDeviceId);
    return this.inviteDevice(targetBundle);
  }

  async inviteDevice(targetBundle: DeviceBundle): Promise<string> {
    const keys = await this.state.getDeviceKeys();
    if (!keys) {
      throw new Error('Device keys not initialized');
    }

    const vaultId = await this.state.getVaultId();
    if (!vaultId) {
      throw new Error('Vault not configured');
    }

    const syncVaultKey = await this.state.getSyncVaultKey();
    if (!syncVaultKey) {
      throw new Error('Sync vault key not found');
    }

    const targetPubBox = base64ToBytes(targetBundle.device_pubkey_box);
    const sealed = boxSeal(syncVaultKey, targetPubBox, keys.privkeyBox);

    const nonce = sealed.slice(0, 24);
    const wrappedPayload = sealed.slice(24);

    const inviteId = newUUID();
    const deviceIdBytes = hexToBytes(keys.deviceId);
    const targetDeviceIdBytes = hexToBytes(targetBundle.device_id);

    const inviteSignBytes = signBytesInvite(
      uuidToBytes(inviteId),
      uuidToBytes(vaultId),
      targetDeviceIdBytes,
      base64ToBytes(targetBundle.device_pubkey_sign),
      base64ToBytes(targetBundle.device_pubkey_box),
      base64ToBytes(targetBundle.device_bundle_sig),
      nonce,
      wrappedPayload,
      deviceIdBytes,
      true
    );

    const signature = sign(keys.privkeySign, inviteSignBytes);

    const invite: Invite = {
      msg_type: 'invite',
      invite_id: inviteId,
      vault_id: vaultId,
      target_device_id: targetBundle.device_id,
      target_device_pubkey_sign: targetBundle.device_pubkey_sign,
      target_device_pubkey_box: targetBundle.device_pubkey_box,
      target_device_bundle_sig: targetBundle.device_bundle_sig,
      nonce: bytesToBase64(nonce),
      wrapped_payload: bytesToBase64(wrappedPayload),
      created_by_device_id: keys.deviceId,
      single_use: true,
      signature: bytesToBase64(signature),
    };

    await this.client.createInvite(vaultId, invite);
    return inviteId;
  }

  async acceptPendingInviteClaims(): Promise<void> {
    const keys = await this.state.getDeviceKeys();
    if (!keys) return;

    const claims = await this.client.getInviteClaims(keys.deviceId);
    if (claims.length === 0) return;

    const vaultId = await this.state.getVaultId();
    if (!vaultId) return;

    for (const claim of claims) {
      if (claim.vault_id !== vaultId) continue;

      try {
        await this.acceptInviteClaim(claim);
      } catch (e) {
        const apiError = e as APIError;
        if (
          apiError.code === 'invite_already_used' ||
          (apiError.statusCode === 409 &&
            apiError.message?.toLowerCase().includes('invite has already been used'))
        ) {
          continue;
        }
        throw e;
      }
    }
  }

  async removeMember(targetDeviceId: string): Promise<void> {
    const keys = await this.state.getDeviceKeys();
    if (!keys) throw new Error('Device keys not initialized');

    const vaultId = await this.state.getVaultId();
    if (!vaultId) throw new Error('Vault not configured');

    const ownerDeviceId = await this.state.getOwnerDeviceId();
    if (!ownerDeviceId || ownerDeviceId !== keys.deviceId) {
      throw new Error('Only the vault owner can remove devices');
    }
    if (targetDeviceId === ownerDeviceId) {
      throw new Error('Cannot remove the owner device');
    }

    const memberHead = await this.state.getMembershipHead();
    if (!memberHead) {
      throw new Error('Membership head not found');
    }

    const newMemberSeq = memberHead.memberSeq + 1;
    const memberEventId = newUUID();
    const deviceIdBytes = hexToBytes(keys.deviceId);
    const targetDeviceIdBytes = hexToBytes(targetDeviceId);

    const signBytes = signBytesMemberRemove(
      uuidToBytes(memberEventId),
      uuidToBytes(vaultId),
      newMemberSeq,
      memberHead.memberHeadHash,
      deviceIdBytes,
      targetDeviceIdBytes
    );

    const signature = sign(keys.privkeySign, signBytes);

    const memberEvent: MemberEvent = {
      msg_type: 'member_remove',
      member_event_id: memberEventId,
      vault_id: vaultId,
      member_seq: newMemberSeq.toString(),
      prev_hash: bytesToBase64(memberHead.memberHeadHash),
      actor_device_id: keys.deviceId,
      subject_device_id: targetDeviceId,
      signature: bytesToBase64(signature),
    };

    await this.client.createMemberEvent(vaultId, memberEvent);

    const eventHash = sha256(signBytes);
    await this.state.setMembershipHead({
      memberSeq: newMemberSeq,
      memberHeadHash: eventHash,
    });
    await this.state.removeVerifiedMember(targetDeviceId);
  }

  private async acceptInviteClaim(claim: InviteClaim): Promise<void> {
    const keys = await this.state.getDeviceKeys();
    if (!keys) throw new Error('Device keys not initialized');

    const vaultId = await this.state.getVaultId();
    if (!vaultId || claim.vault_id !== vaultId) {
      throw new Error('Vault mismatch');
    }

    const targetBundle = await this.client.getDevice(claim.device_id);
    const memberHead = await this.state.getMembershipHead();
    if (!memberHead) {
      throw new Error('Membership head not found');
    }

    const memberEventId = newUUID();
    const newMemberSeq = memberHead.memberSeq + 1;

    const deviceIdBytes = hexToBytes(keys.deviceId);
    const targetDeviceIdBytes = hexToBytes(targetBundle.device_id);

    const signBytes = signBytesMemberAdd(
      uuidToBytes(memberEventId),
      uuidToBytes(vaultId),
      newMemberSeq,
      memberHead.memberHeadHash,
      deviceIdBytes,
      targetDeviceIdBytes,
      uuidToBytes(claim.invite_id),
      base64ToBytes(claim.signature),
      base64ToBytes(targetBundle.device_bundle_sig),
      base64ToBytes(targetBundle.device_pubkey_sign),
      base64ToBytes(targetBundle.device_pubkey_box)
    );

    const signature = sign(keys.privkeySign, signBytes);

    const memberEvent: MemberEvent = {
      msg_type: 'member_add',
      member_event_id: memberEventId,
      vault_id: vaultId,
      member_seq: newMemberSeq.toString(),
      prev_hash: bytesToBase64(memberHead.memberHeadHash),
      actor_device_id: keys.deviceId,
      subject_device_id: targetBundle.device_id,
      subject_pubkey_sign: targetBundle.device_pubkey_sign,
      subject_pubkey_box: targetBundle.device_pubkey_box,
      subject_bundle_sig: targetBundle.device_bundle_sig,
      invite_id: claim.invite_id,
      claim_sig: claim.signature,
      signature: bytesToBase64(signature),
    };

    await this.client.createMemberEvent(vaultId, memberEvent);

    const eventHash = sha256(signBytes);
    await this.state.setMembershipHead({
      memberSeq: newMemberSeq,
      memberHeadHash: eventHash,
    });

    await this.state.setVerifiedMember({
      deviceId: targetBundle.device_id,
      pubkeySign: base64ToBytes(targetBundle.device_pubkey_sign),
      pubkeyBox: base64ToBytes(targetBundle.device_pubkey_box),
      keyEpoch: 1,
    });
  }

  async refreshMembership(): Promise<void> {
    const vaultId = await this.state.getVaultId();
    if (!vaultId) throw new Error('Vault not configured');

    const members = await this.client.getVaultMembers(vaultId);

    const memberHeadHash = base64ToBytes(members.head_hash);
    await this.state.setMembershipHead({
      memberSeq: parseInt(members.member_seq, 10),
      memberHeadHash,
    });

    await this.state.clearVerifiedMembers();

    for (const member of members.members) {
      await this.state.setVerifiedMember({
        deviceId: member.device_id,
        pubkeySign: base64ToBytes(member.device_pubkey_sign),
        pubkeyBox: base64ToBytes(member.device_pubkey_box),
        keyEpoch: parseInt(member.key_epoch, 10),
      });
    }
  }

  async pushEntry(entry: Entry, op: 'upsert' | 'delete'): Promise<void> {
    const keys = await this.state.getDeviceKeys();
    if (!keys) throw new Error('Device keys not initialized');

    const vaultId = await this.state.getVaultId();
    if (!vaultId) throw new Error('Vault not configured');

    const keyEpoch = await this.state.getKeyEpoch();
    const eventHead = await this.state.getEventHead(keys.deviceId);
    const lamport = await this.state.incrementLamport();

    const { ciphertext, nonce } = await this.encryptEventPayload(op, entry);

    const eventId = newUUID();
    const counter = eventHead.lastCounter + 1;
    const deviceIdBytes = hexToBytes(keys.deviceId);

    const eventSignBytes = signBytesEvent(
      uuidToBytes(eventId),
      uuidToBytes(vaultId),
      deviceIdBytes,
      counter,
      lamport,
      keyEpoch,
      eventHead.lastHash,
      nonce,
      ciphertext
    );

    const signature = sign(keys.privkeySign, eventSignBytes);

    const event: SyncEvent = {
      msg_type: 'event',
      event_id: eventId,
      vault_id: vaultId,
      device_id: keys.deviceId,
      counter: counter.toString(),
      lamport: lamport.toString(),
      key_epoch: keyEpoch.toString(),
      prev_hash: bytesToBase64(eventHead.lastHash),
      nonce: bytesToBase64(nonce),
      ciphertext: bytesToBase64(ciphertext),
      signature: bytesToBase64(signature),
    };

    await this.client.pushEvent(vaultId, event);

    const eventHash = sha256(eventSignBytes);
    await this.state.setEventHead(keys.deviceId, {
      lastCounter: counter,
      lastHash: eventHash,
    });

    try {
      if (op === 'upsert') {
        await this.state.setEntryScheme(entry.id, 'v2');
      } else {
        await this.state.removeEntryScheme(entry.id);
      }
    } catch { }
  }

  async syncEntries(localEntries: Entry[]): Promise<Entry[]> {
    const vaultId = await this.state.getVaultId();
    if (!vaultId) return localEntries;

    const cursor = await this.state.getSyncCursor();
    const events = await this.client.pullEvents(vaultId, cursor);

    if (events.length === 0) {
      return localEntries;
    }

    const entryMap = new Map<string, Entry>();
    const entryLamport = new Map<string, number>();
    const entryDeviceId = new Map<string, string>();
    const deletedIds = new Set<string>();

    for (const entry of localEntries) {
      entryMap.set(entry.id, entry);
      entryLamport.set(entry.id, 0);
    }

    let maxSeq = cursor;
    let maxLamport = await this.state.getLamport();

    for (const event of events) {
      const member = await this.state.getVerifiedMember(event.device_id);
      if (!member) continue;

      const deviceIdBytes = hexToBytes(event.device_id);

      const eventSignBytes = signBytesEvent(
        uuidToBytes(event.event_id),
        uuidToBytes(event.vault_id),
        deviceIdBytes,
        parseInt(event.counter, 10),
        parseInt(event.lamport, 10),
        parseInt(event.key_epoch, 10),
        base64ToBytes(event.prev_hash),
        base64ToBytes(event.nonce),
        base64ToBytes(event.ciphertext)
      );

      if (!verify(member.pubkeySign, eventSignBytes, base64ToBytes(event.signature))) {
        continue;
      }

      const result = await this.decryptEventPayload(
        base64ToBytes(event.ciphertext),
        base64ToBytes(event.nonce),
        parseInt(event.key_epoch, 10)
      );
      if (!result) continue;

      const { op, entry, scheme } = result;
      const eventLamport = parseInt(event.lamport, 10);
      const eventDeviceId = event.device_id;

      if (op === 'delete') {
        const existingLamport = entryLamport.get(entry.id) || 0;
        const existingDeviceId = entryDeviceId.get(entry.id) || '';

        if (
          eventLamport > existingLamport ||
          (eventLamport === existingLamport && eventDeviceId > existingDeviceId)
        ) {
          deletedIds.add(entry.id);
          entryMap.delete(entry.id);
          entryLamport.set(entry.id, eventLamport);
          entryDeviceId.set(entry.id, eventDeviceId);
          try {
            await this.state.removeEntryScheme(entry.id);
          } catch { }
        }
      } else if (op === 'upsert') {
        const existingLamport = entryLamport.get(entry.id) || 0;
        const existingDeviceId = entryDeviceId.get(entry.id) || '';

        if (
          eventLamport > existingLamport ||
          (eventLamport === existingLamport && eventDeviceId > existingDeviceId)
        ) {
          if (!deletedIds.has(entry.id)) {
            entryMap.set(entry.id, entry);
            entryLamport.set(entry.id, eventLamport);
            entryDeviceId.set(entry.id, eventDeviceId);
            try {
              await this.state.setEntryScheme(entry.id, scheme);
            } catch { }
          }
        }
      }

      const seq = parseInt(event.seq || '0', 10);
      if (seq > maxSeq) {
        maxSeq = seq;
      }
      if (eventLamport > maxLamport) {
        maxLamport = eventLamport;
      }
    }

    if (maxSeq > cursor) {
      await this.state.setSyncCursor(maxSeq);
    }
    await this.state.updateLamport(maxLamport);

    return Array.from(entryMap.values());
  }

  async flushPendingEntries(): Promise<void> {
    const pending = await this.state.getPendingEntries();
    if (pending.length === 0) return;

    for (const item of pending) {
      try {
        await this.pushEntry(item.entry as Entry, item.op);
        await this.state.removePendingEntry(item.entry.id);
      } catch { }
    }
  }

  private async encryptEventPayload(
    op: string,
    entry: Entry
  ): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
    const syncVaultKey = await this.state.getSyncVaultKey();
    if (!syncVaultKey) throw new Error('Sync vault key not found');

    const keyEpoch = await this.state.getKeyEpoch();
    const eventKey = deriveEventKey(syncVaultKey, keyEpoch);

    const payload = JSON.stringify({ op, entry });
    const plaintext = new TextEncoder().encode(payload);

    const { nonce, ciphertext } = xchacha20poly1305Encrypt(eventKey, plaintext);

    return { ciphertext, nonce };
  }

  private async decryptEventPayload(
    ciphertext: Uint8Array,
    nonce: Uint8Array,
    keyEpoch: number
  ): Promise<{ op: string; entry: Entry; scheme: string } | null> {
    const syncVaultKey = await this.state.getSyncVaultKey();
    if (!syncVaultKey) return null;

    const eventKey = deriveEventKey(syncVaultKey, keyEpoch);
    let plaintext = xchacha20poly1305Decrypt(eventKey, nonce, ciphertext);
    let scheme = 'v2';

    if (!plaintext) {
      const legacyKey = deriveLegacyEventKey(syncVaultKey, keyEpoch);
      plaintext = nacl.secretbox.open(ciphertext, nonce, legacyKey) ?? null;
      if (!plaintext) return null;
      scheme = 'legacy';
    }

    try {
      const payload = JSON.parse(new TextDecoder().decode(plaintext));
      return { op: payload.op, entry: payload.entry, scheme };
    } catch {
      return null;
    }
  }

  async isOwner(): Promise<boolean> {
    const keys = await this.state.getDeviceKeys();
    if (!keys) return false;

    const ownerDeviceId = await this.state.getOwnerDeviceId();
    if (!ownerDeviceId) return false;

    return ownerDeviceId === keys.deviceId;
  }

  async leaveVault(): Promise<void> {
    await this.state.clearVaultState();
    await this.state.clearEventHeads();
    await this.state.clearPendingEntries();
    await this.state.clearVerifiedMembers();
  }
}
