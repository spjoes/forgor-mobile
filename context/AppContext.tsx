import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Entry, Friend, Device, Peer, IncomingShare } from '../services/types';
import { vaultStore } from '../services/storage';
import { discoveryService } from '../services/discovery';
import { httpServer } from '../services/httpServer';
import { SERVICE_PORT } from '../services/config';
import {
  SyncClient,
  SyncEngine,
  SyncState,
  syncState,
  generateDeviceKeys,
  SyncStatus,
} from '../services/sync';
import { base64ToBytes } from '../services/types';

interface AppState {
  isInitialized: boolean;
  isUnlocked: boolean;
  entries: Entry[];
  friends: Friend[];
  device: Device | null;
  peers: Map<string, Peer>;
  pendingShares: IncomingShare[];
  syncStatus: SyncStatus;
  syncConfigured: boolean;
  syncDeviceId: string | null;
  syncVaultId: string | null;
  syncServerUrl: string | null;
  syncSchemeCutover: Date | null;
  syncEntrySchemes: Record<string, string>;
}

interface AppContextType extends AppState {
  initialize: (password: string, deviceName: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  addEntry: (entry: Entry) => Promise<void>;
  updateEntry: (entry: Entry) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  addFriend: (friend: Friend) => Promise<void>;
  deleteFriend: (fingerprint: string) => Promise<void>;
  refreshPeers: () => void;
  addPendingShare: (share: IncomingShare) => void;
  acceptShare: (share: IncomingShare) => Promise<void>;
  rejectShare: (share: IncomingShare) => void;
  checkInitialized: () => Promise<void>;
  setupSync: (serverUrl: string, action: 'create' | 'join', inviteCode?: string) => Promise<void>;
  registerDeviceOnly: (serverUrl: string) => Promise<void>;
  syncNow: () => Promise<void>;
  inviteDevice: (targetDeviceId: string) => Promise<string>;
  leaveVault: () => Promise<void>;
  refreshSyncStatus: () => Promise<void>;
  regenerateDeviceKeys: () => Promise<void>;
  syncSchemeCutover: Date | null;
  syncEntrySchemes: Record<string, string>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    isInitialized: false,
    isUnlocked: false,
    entries: [],
    friends: [],
    device: null,
    peers: new Map(),
    pendingShares: [],
    syncStatus: { status: 'disconnected' },
    syncConfigured: false,
    syncDeviceId: null,
    syncVaultId: null,
    syncServerUrl: null,
    syncSchemeCutover: null,
    syncEntrySchemes: {},
  });

  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null);

  const checkInitialized = useCallback(async () => {
    const initialized = await vaultStore.isInitialized();
    setState((prev) => ({ ...prev, isInitialized: initialized }));
  }, []);

  useEffect(() => {
    checkInitialized();
  }, [checkInitialized]);

  const addPendingShare = useCallback((share: IncomingShare) => {
    setState((prev) => ({
      ...prev,
      pendingShares: [...prev.pendingShares, share],
    }));
  }, []);

  const refreshSyncStatus = useCallback(async () => {
    const configured = await syncState.isConfigured();
    const vaultId = await syncState.getVaultId();
    const serverUrl = await syncState.getServerURL();
    const keys = await syncState.getDeviceKeys();
    const members = await syncState.getVerifiedMembers();
    const pending = await syncState.getPendingEntries();
    const schemes = await syncState.getEntrySchemes();

    setState((prev) => ({
      ...prev,
      syncConfigured: configured,
      syncVaultId: vaultId,
      syncServerUrl: serverUrl,
      syncDeviceId: keys?.deviceId || null,
      syncEntrySchemes: schemes,
      syncStatus: {
        ...prev.syncStatus,
        memberCount: members.length,
        pendingCount: pending.length,
      },
    }));
  }, []);

  const initSyncState = useCallback(async (vaultKey: Uint8Array) => {
    syncState.setVaultKey(vaultKey);

    const hasKeys = await syncState.hasDeviceKeys();
    if (!hasKeys) {
      const keys = await generateDeviceKeys();
      await syncState.setDeviceKeys(keys);
    }

    const cutover = await syncState.ensureSchemeCutover();
    const schemes = await syncState.getEntrySchemes();
    setState((prev) => ({
      ...prev,
      syncSchemeCutover: cutover,
      syncEntrySchemes: schemes,
    }));

    await refreshSyncStatus();
  }, [refreshSyncStatus]);

  const initialize = useCallback(async (password: string, deviceName: string) => {
    await vaultStore.initialize(password, deviceName);
    const device = await vaultStore.getDevice();
    setState((prev) => ({
      ...prev,
      isInitialized: true,
      isUnlocked: true,
      entries: [],
      friends: [],
      device,
    }));

    if (device) {
      const vaultKey = base64ToBytes(device.privkey);
      await initSyncState(vaultKey);

      httpServer.start(SERVICE_PORT, addPendingShare);
      const fingerprint = vaultStore.getDeviceFingerprint(device);
      discoveryService.start(fingerprint, device.name, SERVICE_PORT, (peer) => {
        setState((prev) => {
          const newPeers = new Map(prev.peers);
          const existingFriend = prev.friends.find((f) => f.fingerprint === peer.fingerprint);
          peer.isPaired = !!existingFriend;
          newPeers.set(peer.fingerprint, peer);
          return { ...prev, peers: newPeers };
        });
      });
    }
  }, [addPendingShare, initSyncState]);

  const unlock = useCallback(async (password: string) => {
    const entries = await vaultStore.unlock(password);
    const device = await vaultStore.getDevice();
    const friends = await vaultStore.getAllFriends();

    setState((prev) => ({
      ...prev,
      isUnlocked: true,
      entries,
      friends,
      device,
    }));

    if (device) {
      const vaultKey = base64ToBytes(device.privkey);
      await initSyncState(vaultKey);

      httpServer.start(SERVICE_PORT, addPendingShare);
      const fingerprint = vaultStore.getDeviceFingerprint(device);
      discoveryService.start(fingerprint, device.name, SERVICE_PORT, (peer) => {
        setState((prev) => {
          const newPeers = new Map(prev.peers);
          const existingFriend = prev.friends.find((f) => f.fingerprint === peer.fingerprint);
          peer.isPaired = !!existingFriend;
          newPeers.set(peer.fingerprint, peer);
          return { ...prev, peers: newPeers };
        });
      });
    }
  }, [addPendingShare, initSyncState]);

  const lock = useCallback(() => {
    vaultStore.lock();
    syncState.clearVaultKey();
    httpServer.stop();
    discoveryService.stop();
    setSyncEngine(null);
    setState((prev) => ({
      ...prev,
      isUnlocked: false,
      entries: [],
      friends: [],
      device: null,
      peers: new Map(),
      pendingShares: [],
      syncStatus: { status: 'disconnected' },
      syncSchemeCutover: null,
      syncEntrySchemes: {},
    }));
  }, []);

  const saveEntriesAndPush = useCallback(async (newEntries: Entry[], changedEntry?: Entry, op?: 'upsert' | 'delete') => {
    await vaultStore.saveEntries(newEntries);
    setState((prev) => ({ ...prev, entries: newEntries }));

    if (syncEngine && changedEntry && op) {
      try {
        await syncEngine.pushEntry(changedEntry, op);
        setState((prev) => ({
          ...prev,
          syncEntrySchemes: op === 'delete'
            ? Object.fromEntries(Object.entries(prev.syncEntrySchemes).filter(([id]) => id !== changedEntry.id))
            : { ...prev.syncEntrySchemes, [changedEntry.id]: 'v2' },
          syncStatus: { ...prev.syncStatus, status: 'synced', lastSync: new Date() },
        }));
      } catch {
        await syncState.addPendingEntry(op, changedEntry);
        setState((prev) => ({
          ...prev,
          syncStatus: { ...prev.syncStatus, status: 'error', errorMessage: 'Failed to sync (queued for retry)' },
        }));
      }
    }
  }, [syncEngine]);

  const addEntry = useCallback(async (entry: Entry) => {
    const newEntries = [...state.entries, entry];
    await saveEntriesAndPush(newEntries, entry, 'upsert');
  }, [state.entries, saveEntriesAndPush]);

  const updateEntry = useCallback(async (entry: Entry) => {
    const newEntries = state.entries.map((e) => (e.id === entry.id ? entry : e));
    await saveEntriesAndPush(newEntries, entry, 'upsert');
  }, [state.entries, saveEntriesAndPush]);

  const deleteEntry = useCallback(async (id: string) => {
    const entryToDelete = state.entries.find((e) => e.id === id);
    const newEntries = state.entries.filter((e) => e.id !== id);
    await saveEntriesAndPush(newEntries, entryToDelete, 'delete');
  }, [state.entries, saveEntriesAndPush]);

  const addFriend = useCallback(async (friend: Friend) => {
    await vaultStore.saveFriend(friend);
    const friends = await vaultStore.getAllFriends();
    setState((prev) => {
      const newPeers = new Map(prev.peers);
      const peer = newPeers.get(friend.fingerprint);
      if (peer) {
        peer.isPaired = true;
        newPeers.set(friend.fingerprint, peer);
      }
      return { ...prev, friends, peers: newPeers };
    });
  }, []);

  const deleteFriend = useCallback(async (fingerprint: string) => {
    await vaultStore.deleteFriend(fingerprint);
    const friends = await vaultStore.getAllFriends();
    setState((prev) => {
      const newPeers = new Map(prev.peers);
      const peer = newPeers.get(fingerprint);
      if (peer) {
        peer.isPaired = false;
        newPeers.set(fingerprint, peer);
      }
      return { ...prev, friends, peers: newPeers };
    });
  }, []);

  const refreshPeers = useCallback(() => {
    discoveryService.refresh();
  }, []);

  const acceptShare = useCallback(async (share: IncomingShare) => {
    const newEntries = [...state.entries, share.entry];
    await vaultStore.saveEntries(newEntries);
    setState((prev) => ({
      ...prev,
      entries: newEntries,
      pendingShares: prev.pendingShares.filter((s) => s !== share),
    }));
  }, [state.entries]);

  const rejectShare = useCallback((share: IncomingShare) => {
    setState((prev) => ({
      ...prev,
      pendingShares: prev.pendingShares.filter((s) => s !== share),
    }));
  }, []);

  const registerDeviceOnly = useCallback(async (serverUrl: string) => {
    let normalizedUrl = serverUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'http://' + normalizedUrl;
    }

    await syncState.setServerURL(normalizedUrl);

    const hasKeys = await syncState.hasDeviceKeys();
    if (!hasKeys) {
      const keys = await generateDeviceKeys();
      await syncState.setDeviceKeys(keys);
    }

    const client = new SyncClient(normalizedUrl);
    const engine = new SyncEngine(client, syncState);

    await engine.registerDevice();
    await refreshSyncStatus();
  }, [refreshSyncStatus]);

  const regenerateDeviceKeys = useCallback(async () => {
    await syncState.clearDeviceKeys();
    const keys = await generateDeviceKeys();
    await syncState.setDeviceKeys(keys);
    await refreshSyncStatus();
  }, [refreshSyncStatus]);

  const setupSync = useCallback(async (serverUrl: string, action: 'create' | 'join', inviteCode?: string) => {
    let normalizedUrl = serverUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'http://' + normalizedUrl;
    }

    await syncState.setServerURL(normalizedUrl);

    const hasKeys = await syncState.hasDeviceKeys();
    if (!hasKeys) {
      const keys = await generateDeviceKeys();
      await syncState.setDeviceKeys(keys);
    }

    const client = new SyncClient(normalizedUrl);
    const engine = new SyncEngine(client, syncState);

    await engine.registerDevice();

    if (action === 'create') {
      await engine.createVault();

      for (const entry of state.entries) {
        try {
          await engine.pushEntry(entry, 'upsert');
        } catch {
          await syncState.addPendingEntry('upsert', entry);
        }
      }
      await syncState.setLegacySeeded(true);
    } else if (action === 'join' && inviteCode) {
      await engine.joinVault(inviteCode);
      await syncState.setLegacySeeded(false);
    }

    setSyncEngine(engine);
    await refreshSyncStatus();

    setState((prev) => ({
      ...prev,
      syncStatus: { status: 'synced', lastSync: new Date() },
    }));
  }, [state.entries, refreshSyncStatus]);

  const seedLocalEntriesIfNeeded = useCallback(async (entriesToSeed: Entry[]) => {
    if (!syncEngine) return;
    if (entriesToSeed.length === 0) return;

    const keys = await syncState.getDeviceKeys();
    if (!keys) return;

    const head = await syncState.getEventHead(keys.deviceId);
    if (head.lastCounter !== 0) {
      return;
    }

    for (const entry of entriesToSeed) {
      try {
        await syncEngine.pushEntry(entry, 'upsert');
      } catch {
        await syncState.addPendingEntry('upsert', entry);
      }
    }
  }, [syncEngine]);

  const seedLegacyEntriesOnce = useCallback(async (entriesToSeed: Entry[]) => {
    if (!syncEngine) return;
    const alreadySeeded = await syncState.getLegacySeeded();
    const schemes = await syncState.getEntrySchemes();
    const hasSchemes = Object.keys(schemes).length > 0;
    if (alreadySeeded && hasSchemes) return;

    for (const entry of entriesToSeed) {
      try {
        await syncEngine.pushEntry(entry, 'upsert');
      } catch {
        await syncState.addPendingEntry('upsert', entry);
      }
    }

    await syncState.setLegacySeeded(true);
  }, [syncEngine]);

  const syncNow = useCallback(async () => {
    if (!syncEngine) {
      throw new Error('Sync not configured');
    }

    setState((prev) => ({
      ...prev,
      syncStatus: { ...prev.syncStatus, status: 'syncing' },
    }));

    try {
      const isOwner = await syncEngine.isOwner();
      if (isOwner) {
        await syncEngine.acceptPendingInviteClaims();
      }

      await syncEngine.refreshMembership();

      try {
        await seedLocalEntriesIfNeeded(state.entries);
      } catch { }

      try {
        await seedLegacyEntriesOnce(state.entries);
      } catch { }

      await syncEngine.flushPendingEntries();

      let newEntries = await syncEngine.syncEntries(state.entries);
      let schemes = await syncState.getEntrySchemes();
      let pending = await syncState.getPendingEntries();

      if (pending.length === 0) {
        const missingSchemes = newEntries.some((entry) => !schemes[entry.id]);
        if (missingSchemes) {
          try {
            await syncState.setSyncCursor(0);
            newEntries = await syncEngine.syncEntries(newEntries);
            schemes = await syncState.getEntrySchemes();
            pending = await syncState.getPendingEntries();
          } catch { }
        }
      }

      if (JSON.stringify(newEntries) !== JSON.stringify(state.entries)) {
        await vaultStore.saveEntries(newEntries);
        setState((prev) => ({
          ...prev,
          entries: newEntries,
        }));
      }

      const members = await syncState.getVerifiedMembers();

      setState((prev) => ({
        ...prev,
        syncStatus: {
          status: 'synced',
          lastSync: new Date(),
          memberCount: members.length,
          pendingCount: pending.length,
        },
        syncEntrySchemes: schemes,
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        syncStatus: {
          status: 'error',
          errorMessage: e instanceof Error ? e.message : 'Sync failed',
        },
      }));
      throw e;
    }
  }, [syncEngine, state.entries, seedLocalEntriesIfNeeded, seedLegacyEntriesOnce]);

  const inviteDevice = useCallback(async (targetDeviceId: string): Promise<string> => {
    if (!syncEngine) {
      throw new Error('Sync not configured');
    }

    for (const entry of state.entries) {
      try {
        await syncEngine.pushEntry(entry, 'upsert');
      } catch {
        await syncState.addPendingEntry('upsert', entry);
      }
    }

    return syncEngine.inviteDeviceById(targetDeviceId.trim());
  }, [syncEngine, state.entries]);

  const leaveVault = useCallback(async () => {
    if (syncEngine) {
      await syncEngine.leaveVault();
    }
    setSyncEngine(null);
    await refreshSyncStatus();

    setState((prev) => ({
      ...prev,
      syncStatus: { status: 'disconnected' },
      syncConfigured: false,
      syncVaultId: null,
    }));
  }, [syncEngine, refreshSyncStatus]);

  useEffect(() => {
    const initEngine = async () => {
      if (state.isUnlocked && state.syncConfigured && !syncEngine) {
        const serverUrl = await syncState.getServerURL();
        if (serverUrl) {
          const client = new SyncClient(serverUrl);
          const engine = new SyncEngine(client, syncState);
          setSyncEngine(engine);
        }
      }
    };
    initEngine();
  }, [state.isUnlocked, state.syncConfigured, syncEngine]);

  return (
    <AppContext.Provider
      value={{
        ...state,
        initialize,
        unlock,
        lock,
        addEntry,
        updateEntry,
        deleteEntry,
        addFriend,
        deleteFriend,
        refreshPeers,
        addPendingShare,
        acceptShare,
        rejectShare,
        checkInitialized,
        setupSync,
        registerDeviceOnly,
        syncNow,
        inviteDevice,
        leaveVault,
        refreshSyncStatus,
        regenerateDeviceKeys,
        syncSchemeCutover: state.syncSchemeCutover,
        syncEntrySchemes: state.syncEntrySchemes,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
