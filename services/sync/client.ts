import {
  DeviceBundle,
  SyncEvent,
  MemberEvent,
  Invite,
  InviteClaim,
  KeyUpdate,
  KeyUpdateAck,
  Snapshot,
  VaultMembershipResponse,
  EventResponse,
} from './types';

export interface APIError {
  statusCode: number;
  code: string;
  message: string;
}

export class SyncClient {
  private baseURL: string;
  private timeout: number;

  constructor(baseURL: string, timeout: number = 30000) {
    this.baseURL = baseURL;
    this.timeout = timeout;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const options: RequestInit = {
        method,
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      };

      if (body) {
        options.headers = {
          ...options.headers,
          'Content-Type': 'application/json',
        };
        options.body = JSON.stringify(body);
      }

      const response = await fetch(`${this.baseURL}${path}`, options);
      const responseText = await response.text();

      if (response.status >= 400) {
        let apiError: APIError;
        try {
          const parsed = JSON.parse(responseText);
          apiError = {
            statusCode: response.status,
            code: parsed.code || 'unknown_error',
            message: parsed.message || responseText,
          };
        } catch {
          apiError = {
            statusCode: response.status,
            code: 'unknown_error',
            message: responseText,
          };
        }
        throw apiError;
      }

      if (responseText) {
        return JSON.parse(responseText) as T;
      }
      return undefined as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async registerDevice(bundle: DeviceBundle): Promise<void> {
    await this.request<void>('POST', '/v1/devices/register', bundle);
  }

  async getDevice(deviceId: string): Promise<DeviceBundle> {
    return this.request<DeviceBundle>(
      'GET',
      `/v1/devices/${encodeURIComponent(deviceId)}`
    );
  }

  async createInvite(vaultId: string, invite: Invite): Promise<void> {
    await this.request<void>(
      'POST',
      `/v1/vaults/${vaultId}/invites`,
      invite
    );
  }

  async getInvites(deviceId: string): Promise<Invite[]> {
    const result = await this.request<Invite[]>(
      'GET',
      `/v1/invites?device_id=${encodeURIComponent(deviceId)}`
    );
    return result || [];
  }

  async claimInvite(inviteId: string, claim: InviteClaim): Promise<void> {
    await this.request<void>(
      'POST',
      `/v1/invites/${inviteId}/claim`,
      claim
    );
  }

  async getInviteClaims(createdByDeviceId: string): Promise<InviteClaim[]> {
    const result = await this.request<InviteClaim[]>(
      'GET',
      `/v1/invite_claims?created_by_device_id=${encodeURIComponent(createdByDeviceId)}`
    );
    return result || [];
  }

  async createMemberEvent(vaultId: string, event: MemberEvent): Promise<void> {
    await this.request<void>(
      'POST',
      `/v1/vaults/${vaultId}/member_events`,
      event
    );
  }

  async getMemberEvents(vaultId: string, sinceSeq: number): Promise<MemberEvent[]> {
    const result = await this.request<MemberEvent[]>(
      'GET',
      `/v1/vaults/${vaultId}/member_events?since_seq=${sinceSeq}`
    );
    return result || [];
  }

  async getVaultMembers(vaultId: string): Promise<VaultMembershipResponse> {
    return this.request<VaultMembershipResponse>(
      'GET',
      `/v1/vaults/${vaultId}/members`
    );
  }

  async pushEvent(vaultId: string, event: SyncEvent): Promise<EventResponse> {
    return this.request<EventResponse>(
      'POST',
      `/v1/vaults/${vaultId}/events`,
      event
    );
  }

  async pullEvents(vaultId: string, sinceSeq: number): Promise<SyncEvent[]> {
    const result = await this.request<SyncEvent[]>(
      'GET',
      `/v1/vaults/${vaultId}/events?since_seq=${sinceSeq}`
    );
    return result || [];
  }

  async createKeyUpdate(vaultId: string, keyUpdate: KeyUpdate): Promise<void> {
    await this.request<void>(
      'POST',
      `/v1/vaults/${vaultId}/key_updates`,
      keyUpdate
    );
  }

  async getKeyUpdates(deviceId: string): Promise<KeyUpdate[]> {
    const result = await this.request<KeyUpdate[]>(
      'GET',
      `/v1/key_updates?target_device_id=${encodeURIComponent(deviceId)}`
    );
    return result || [];
  }

  async ackKeyUpdate(vaultId: string, ack: KeyUpdateAck): Promise<void> {
    await this.request<void>(
      'POST',
      `/v1/vaults/${vaultId}/key_update_acks`,
      ack
    );
  }

  async createSnapshot(vaultId: string, snapshot: Snapshot): Promise<void> {
    await this.request<void>(
      'POST',
      `/v1/vaults/${vaultId}/snapshots`,
      snapshot
    );
  }

  async getLatestSnapshot(vaultId: string): Promise<Snapshot | null> {
    try {
      return await this.request<Snapshot>(
        'GET',
        `/v1/vaults/${vaultId}/snapshots/latest`
      );
    } catch (e) {
      const apiError = e as APIError;
      if (apiError.statusCode === 404) {
        return null;
      }
      throw e;
    }
  }
}
