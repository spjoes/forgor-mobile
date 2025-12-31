import { CBEEncoder } from './cbe';
import { ZERO64, ZERO32, ZERO_UUID } from './types';

const SIGN_PREFIX = 'forgor-sync-v1';

export function signBytesDeviceBundle(
  deviceId: Uint8Array,
  pubkeySign: Uint8Array,
  pubkeyBox: Uint8Array
): Uint8Array {
  const e = new CBEEncoder();
  e.writeString(SIGN_PREFIX);
  e.writeString('device_bundle');
  e.writeDeviceID(deviceId);
  e.writePublicKey(pubkeySign);
  e.writePublicKey(pubkeyBox);
  return e.bytes();
}

export function signBytesEvent(
  eventId: Uint8Array,
  vaultId: Uint8Array,
  deviceId: Uint8Array,
  counter: number,
  lamport: number,
  keyEpoch: number,
  prevHash: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array
): Uint8Array {
  const e = new CBEEncoder();
  e.writeString(SIGN_PREFIX);
  e.writeString('event');
  e.writeUUID(eventId);
  e.writeUUID(vaultId);
  e.writeDeviceID(deviceId);
  e.writeU64(counter);
  e.writeU64(lamport);
  e.writeU64(keyEpoch);
  e.writeHash(prevHash);
  e.writeNonce(nonce);
  e.writeBytes(ciphertext);
  return e.bytes();
}

export function signBytesMemberAdd(
  memberEventId: Uint8Array,
  vaultId: Uint8Array,
  memberSeq: number,
  prevHash: Uint8Array,
  actorDeviceId: Uint8Array,
  subjectDeviceId: Uint8Array,
  inviteId: Uint8Array,
  claimSig: Uint8Array,
  subjectBundleSig: Uint8Array,
  subjectPubkeySign: Uint8Array,
  subjectPubkeyBox: Uint8Array
): Uint8Array {
  const e = new CBEEncoder();
  e.writeString(SIGN_PREFIX);
  e.writeString('member_add');
  e.writeUUID(memberEventId);
  e.writeUUID(vaultId);
  e.writeU64(memberSeq);
  e.writeHash(prevHash);
  e.writeDeviceID(actorDeviceId);
  e.writeDeviceID(subjectDeviceId);
  e.writeUUID(inviteId);
  e.writeSignature(claimSig);
  e.writeSignature(subjectBundleSig);
  e.writePublicKey(subjectPubkeySign);
  e.writePublicKey(subjectPubkeyBox);
  return e.bytes();
}

export function signBytesMemberRemove(
  memberEventId: Uint8Array,
  vaultId: Uint8Array,
  memberSeq: number,
  prevHash: Uint8Array,
  actorDeviceId: Uint8Array,
  subjectDeviceId: Uint8Array
): Uint8Array {
  const e = new CBEEncoder();
  e.writeString(SIGN_PREFIX);
  e.writeString('member_remove');
  e.writeUUID(memberEventId);
  e.writeUUID(vaultId);
  e.writeU64(memberSeq);
  e.writeHash(prevHash);
  e.writeDeviceID(actorDeviceId);
  e.writeDeviceID(subjectDeviceId);
  e.writeUUID(ZERO_UUID);
  e.writeSignature(ZERO64);
  e.writeSignature(ZERO64);
  e.writePublicKey(ZERO32);
  e.writePublicKey(ZERO32);
  return e.bytes();
}

export function signBytesInvite(
  inviteId: Uint8Array,
  vaultId: Uint8Array,
  targetDeviceId: Uint8Array,
  targetPubkeySign: Uint8Array,
  targetPubkeyBox: Uint8Array,
  targetBundleSig: Uint8Array,
  nonce: Uint8Array,
  wrappedPayload: Uint8Array,
  createdByDeviceId: Uint8Array,
  singleUse: boolean
): Uint8Array {
  const e = new CBEEncoder();
  e.writeString(SIGN_PREFIX);
  e.writeString('invite');
  e.writeUUID(inviteId);
  e.writeUUID(vaultId);
  e.writeDeviceID(targetDeviceId);
  e.writePublicKey(targetPubkeySign);
  e.writePublicKey(targetPubkeyBox);
  e.writeSignature(targetBundleSig);
  e.writeNonce(nonce);
  e.writeBytes(wrappedPayload);
  e.writeDeviceID(createdByDeviceId);
  e.writeBool(singleUse);
  return e.bytes();
}

export function signBytesInviteClaim(
  inviteId: Uint8Array,
  vaultId: Uint8Array,
  deviceId: Uint8Array
): Uint8Array {
  const e = new CBEEncoder();
  e.writeString(SIGN_PREFIX);
  e.writeString('invite_claim');
  e.writeUUID(inviteId);
  e.writeUUID(vaultId);
  e.writeDeviceID(deviceId);
  return e.bytes();
}

export function signBytesKeyUpdate(
  keyUpdateId: Uint8Array,
  vaultId: Uint8Array,
  memberSeq: number,
  memberHeadHash: Uint8Array,
  targetDeviceId: Uint8Array,
  keyEpoch: number,
  nonce: Uint8Array,
  wrappedPayload: Uint8Array,
  createdByDeviceId: Uint8Array
): Uint8Array {
  const e = new CBEEncoder();
  e.writeString(SIGN_PREFIX);
  e.writeString('key_update');
  e.writeUUID(keyUpdateId);
  e.writeUUID(vaultId);
  e.writeU64(memberSeq);
  e.writeHash(memberHeadHash);
  e.writeDeviceID(targetDeviceId);
  e.writeU64(keyEpoch);
  e.writeNonce(nonce);
  e.writeBytes(wrappedPayload);
  e.writeDeviceID(createdByDeviceId);
  return e.bytes();
}

export function signBytesKeyUpdateAck(
  vaultId: Uint8Array,
  deviceId: Uint8Array,
  keyEpoch: number,
  memberSeq: number,
  memberHeadHash: Uint8Array
): Uint8Array {
  const e = new CBEEncoder();
  e.writeString(SIGN_PREFIX);
  e.writeString('key_update_ack');
  e.writeUUID(vaultId);
  e.writeDeviceID(deviceId);
  e.writeU64(keyEpoch);
  e.writeU64(memberSeq);
  e.writeHash(memberHeadHash);
  return e.bytes();
}

export function signBytesSnapshot(
  snapshotId: Uint8Array,
  vaultId: Uint8Array,
  baseSeq: number,
  memberSeq: number,
  memberHeadHash: Uint8Array,
  baseCounterMap: Uint8Array,
  headHashMap: Uint8Array,
  lamportAtSnapshot: number,
  keyEpoch: number,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  createdByDeviceId: Uint8Array
): Uint8Array {
  const e = new CBEEncoder();
  e.writeString(SIGN_PREFIX);
  e.writeString('snapshot');
  e.writeUUID(snapshotId);
  e.writeUUID(vaultId);
  e.writeU64(baseSeq);
  e.writeU64(memberSeq);
  e.writeHash(memberHeadHash);
  e.writeBytes(baseCounterMap);
  e.writeBytes(headHashMap);
  e.writeU64(lamportAtSnapshot);
  e.writeU64(keyEpoch);
  e.writeNonce(nonce);
  e.writeBytes(ciphertext);
  e.writeDeviceID(createdByDeviceId);
  return e.bytes();
}
