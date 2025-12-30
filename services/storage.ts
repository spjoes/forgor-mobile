import AsyncStorage from '@react-native-async-storage/async-storage';
import { Entry, Friend, Device, bytesToBase64, base64ToBytes, computeFingerprint } from './types';
import { generateSalt, deriveKey, encrypt, decrypt, generateBoxKeyPair } from './crypto';

const KEYS = {
  SALT: 'forgor_salt',
  VAULT: 'forgor_vault',
  FRIENDS: 'forgor_friends',
  DEVICE_NAME: 'forgor_device_name',
  DEVICE_PUBKEY: 'forgor_device_pubkey',
  DEVICE_PRIVKEY_ENC: 'forgor_device_privkey_enc',
};

class VaultStore {
  private vaultKey: Uint8Array | null = null;

  async isInitialized(): Promise<boolean> {
    const salt = await AsyncStorage.getItem(KEYS.SALT);
    return salt !== null;
  }

  async initialize(masterPassword: string, deviceName: string): Promise<void> {
    const salt = await generateSalt();
    const vaultKey = await deriveKey(masterPassword, salt);

    const keyPair = generateBoxKeyPair();

    const privKeyEnc = encrypt(vaultKey, keyPair.secretKey);

    const emptyVault = JSON.stringify([]);
    const encryptedVault = encrypt(vaultKey, new TextEncoder().encode(emptyVault));

    await AsyncStorage.multiSet([
      [KEYS.SALT, bytesToBase64(salt)],
      [KEYS.VAULT, bytesToBase64(encryptedVault)],
      [KEYS.DEVICE_NAME, deviceName],
      [KEYS.DEVICE_PUBKEY, bytesToBase64(keyPair.publicKey)],
      [KEYS.DEVICE_PRIVKEY_ENC, bytesToBase64(privKeyEnc)],
    ]);

    this.vaultKey = vaultKey;
  }

  async unlock(masterPassword: string): Promise<Entry[]> {
    const saltB64 = await AsyncStorage.getItem(KEYS.SALT);
    const encryptedVaultB64 = await AsyncStorage.getItem(KEYS.VAULT);

    if (!saltB64 || !encryptedVaultB64) {
      throw new Error('Vault not initialized');
    }

    const salt = base64ToBytes(saltB64);
    const vaultKey = await deriveKey(masterPassword, salt);

    const encryptedVault = base64ToBytes(encryptedVaultB64);
    const plaintext = decrypt(vaultKey, encryptedVault);

    if (!plaintext) {
      throw new Error('Decryption failed: invalid password');
    }

    const entries: Entry[] = JSON.parse(new TextDecoder().decode(plaintext));
    this.vaultKey = vaultKey;
    return entries;
  }

  lock(): void {
    if (this.vaultKey) {
      this.vaultKey.fill(0);
      this.vaultKey = null;
    }
  }

  isUnlocked(): boolean {
    return this.vaultKey !== null;
  }

  async saveEntries(entries: Entry[]): Promise<void> {
    if (!this.vaultKey) {
      throw new Error('Vault is locked');
    }

    const plaintext = new TextEncoder().encode(JSON.stringify(entries));
    const ciphertext = encrypt(this.vaultKey, plaintext);
    await AsyncStorage.setItem(KEYS.VAULT, bytesToBase64(ciphertext));
  }

  async getDevice(): Promise<Device | null> {
    if (!this.vaultKey) {
      return null;
    }

    const name = await AsyncStorage.getItem(KEYS.DEVICE_NAME);
    const pubkeyB64 = await AsyncStorage.getItem(KEYS.DEVICE_PUBKEY);
    const privkeyEncB64 = await AsyncStorage.getItem(KEYS.DEVICE_PRIVKEY_ENC);

    if (!name || !pubkeyB64 || !privkeyEncB64) {
      return null;
    }

    const privkeyEnc = base64ToBytes(privkeyEncB64);
    const privkey = decrypt(this.vaultKey, privkeyEnc);

    if (!privkey) {
      return null;
    }

    return {
      name,
      pubkey: pubkeyB64,
      privkey: bytesToBase64(privkey),
    };
  }

  getDeviceFingerprint(device: Device): string {
    return computeFingerprint(device.pubkey);
  }

  async saveFriend(friend: Friend): Promise<void> {
    const friends = await this.getAllFriends();
    const existingIndex = friends.findIndex((f) => f.fingerprint === friend.fingerprint);

    if (existingIndex >= 0) {
      friends[existingIndex] = friend;
    } else {
      friends.push(friend);
    }

    await this.saveFriends(friends);
  }

  private async saveFriends(friends: Friend[]): Promise<void> {
    if (!this.vaultKey) {
      throw new Error('Vault is locked');
    }

    const plaintext = new TextEncoder().encode(JSON.stringify(friends));
    const ciphertext = encrypt(this.vaultKey, plaintext);
    await AsyncStorage.setItem(KEYS.FRIENDS, bytesToBase64(ciphertext));
  }

  async getFriend(fingerprint: string): Promise<Friend | null> {
    const friends = await this.getAllFriends();
    return friends.find((f) => f.fingerprint === fingerprint) || null;
  }

  async getAllFriends(): Promise<Friend[]> {
    if (!this.vaultKey) {
      return [];
    }

    const encryptedFriendsB64 = await AsyncStorage.getItem(KEYS.FRIENDS);
    if (!encryptedFriendsB64) {
      return [];
    }

    const encryptedFriends = base64ToBytes(encryptedFriendsB64);
    const plaintext = decrypt(this.vaultKey, encryptedFriends);

    if (!plaintext) {
      return [];
    }

    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  async deleteFriend(fingerprint: string): Promise<void> {
    const friends = await this.getAllFriends();
    const newFriends = friends.filter((f) => f.fingerprint !== fingerprint);
    await this.saveFriends(newFriends);
  }

  async updateDeviceName(name: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.DEVICE_NAME, name);
  }
}

export const vaultStore = new VaultStore();
