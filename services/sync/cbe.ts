export class CBEEncoder {
  private buffer: number[] = [];

  bytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  reset(): void {
    this.buffer = [];
  }

  writeU8(v: number): void {
    this.buffer.push(v & 0xff);
  }

  writeU32(v: number): void {
    this.buffer.push((v >>> 24) & 0xff);
    this.buffer.push((v >>> 16) & 0xff);
    this.buffer.push((v >>> 8) & 0xff);
    this.buffer.push(v & 0xff);
  }

  writeU64(v: number): void {
    const high = Math.floor(v / 0x100000000);
    const low = v >>> 0;
    this.writeU32(high);
    this.writeU32(low);
  }

  writeFixedBytes(b: Uint8Array, expectedLen: number): void {
    if (b.length !== expectedLen) {
      throw new Error(`Expected ${expectedLen} bytes, got ${b.length}`);
    }
    for (let i = 0; i < b.length; i++) {
      this.buffer.push(b[i]);
    }
  }

  writeBytes(b: Uint8Array): void {
    this.writeU32(b.length);
    for (let i = 0; i < b.length; i++) {
      this.buffer.push(b[i]);
    }
  }

  writeString(s: string): void {
    const bytes = new TextEncoder().encode(s);
    this.writeU32(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]);
    }
  }

  writeBool(v: boolean): void {
    this.buffer.push(v ? 1 : 0);
  }

  writeUUID(uuid: Uint8Array): void {
    this.writeFixedBytes(uuid, 16);
  }

  writeDeviceID(deviceId: Uint8Array): void {
    this.writeFixedBytes(deviceId, 32);
  }

  writeHash(hash: Uint8Array): void {
    this.writeFixedBytes(hash, 32);
  }

  writeSignature(sig: Uint8Array): void {
    this.writeFixedBytes(sig, 64);
  }

  writeNonce(nonce: Uint8Array): void {
    this.writeFixedBytes(nonce, 24);
  }

  writePublicKey(key: Uint8Array): void {
    this.writeFixedBytes(key, 32);
  }

  writeStringArray(arr: string[]): void {
    this.writeU32(arr.length);
    for (const s of arr) {
      this.writeString(s);
    }
  }

  writeDeviceIDCounterMap(entries: { deviceId: Uint8Array; counter: number }[]): void {
    const sorted = [...entries].sort((a, b) => {
      for (let i = 0; i < 32; i++) {
        if (a.deviceId[i] < b.deviceId[i]) return -1;
        if (a.deviceId[i] > b.deviceId[i]) return 1;
      }
      return 0;
    });

    this.writeU32(sorted.length);
    for (const entry of sorted) {
      this.writeDeviceID(entry.deviceId);
      this.writeU64(entry.counter);
    }
  }

  writeDeviceIDHashMap(entries: { deviceId: Uint8Array; hash: Uint8Array }[]): void {
    const sorted = [...entries].sort((a, b) => {
      for (let i = 0; i < 32; i++) {
        if (a.deviceId[i] < b.deviceId[i]) return -1;
        if (a.deviceId[i] > b.deviceId[i]) return 1;
      }
      return 0;
    });

    this.writeU32(sorted.length);
    for (const entry of sorted) {
      this.writeDeviceID(entry.deviceId);
      this.writeHash(entry.hash);
    }
  }
}
