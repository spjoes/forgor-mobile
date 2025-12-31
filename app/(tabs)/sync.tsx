import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../../context/AppContext';

type Mode = 'list' | 'setup' | 'invite' | 'join';

export default function SyncScreen() {
  const {
    syncStatus,
    syncConfigured,
    syncDeviceId,
    syncVaultId,
    setupSync,
    registerDeviceOnly,
    syncNow,
    inviteDevice,
    leaveVault,
  } = useApp();

  const [mode, setMode] = useState<Mode>('list');
  const [serverUrl, setServerUrl] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [targetDeviceId, setTargetDeviceId] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [deviceRegistered, setDeviceRegistered] = useState(false);

  const handleSetupCreate = useCallback(async () => {
    if (!serverUrl.trim()) {
      setStatusMessage('Please enter a server URL');
      setIsError(true);
      return;
    }

    setLoading(true);
    setStatusMessage('');
    try {
      await setupSync(serverUrl, 'create');
      setMode('list');
      setServerUrl('');
      setStatusMessage('Vault created successfully!');
      setIsError(false);
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : 'Setup failed');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, setupSync]);

  const handleGoToJoin = useCallback(async () => {
    if (!serverUrl.trim()) {
      setStatusMessage('Please enter a server URL first');
      setIsError(true);
      return;
    }

    setLoading(true);
    setStatusMessage('Registering device with server...');
    setIsError(false);
    try {
      await registerDeviceOnly(serverUrl);
      setDeviceRegistered(true);
      setMode('join');
      setStatusMessage('Device registered! Share your Device ID with the vault owner.');
      setIsError(false);
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : 'Failed to register device');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, registerDeviceOnly]);

  const handleJoinVault = useCallback(async () => {
    if (!inviteCode.trim()) {
      setStatusMessage('Please enter an invite code');
      setIsError(true);
      return;
    }

    setLoading(true);
    setStatusMessage('');
    try {
      await setupSync(serverUrl, 'join', inviteCode.trim());
      setMode('list');
      setServerUrl('');
      setInviteCode('');
      setDeviceRegistered(false);
      setStatusMessage('Successfully joined vault!');
      setIsError(false);
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : 'Failed to join vault');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, inviteCode, setupSync]);

  const handleSyncNow = useCallback(async () => {
    setLoading(true);
    setStatusMessage('');
    try {
      await syncNow();
      setStatusMessage('Synced successfully!');
      setIsError(false);
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : 'Sync failed');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, [syncNow]);

  const handleInviteDevice = useCallback(async () => {
    if (!targetDeviceId.trim()) {
      setStatusMessage('Please enter a target device ID');
      setIsError(true);
      return;
    }

    setLoading(true);
    setStatusMessage('');
    try {
      const inviteId = await inviteDevice(targetDeviceId);
      setGeneratedInvite(inviteId);
      setStatusMessage('Invite created!');
      setIsError(false);
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : 'Failed to create invite');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, [targetDeviceId, inviteDevice]);

  const handleLeaveVault = useCallback(() => {
    Alert.alert(
      'Leave Vault',
      'Are you sure you want to leave this vault? Your local data will remain but you will no longer sync with other devices.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveVault();
              setStatusMessage('Left vault');
              setIsError(false);
            } catch (e) {
              setStatusMessage(e instanceof Error ? e.message : 'Failed to leave vault');
              setIsError(true);
            }
          },
        },
      ]
    );
  }, [leaveVault]);

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    setStatusMessage(`${label} copied to clipboard`);
    setIsError(false);
  }, []);

  const formatDeviceId = (deviceId: string): string => {
    return deviceId.match(/.{1,4}/g)?.join(' ') || deviceId;
  };

  const renderList = () => (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Cloud Sync</Text>
      <Text style={styles.subtitle}>Sync your vault across devices</Text>

      {syncDeviceId && (
        <View style={styles.infoSection}>
          <Text style={styles.infoLabel}>Device ID:</Text>
          <TouchableOpacity onPress={() => copyToClipboard(syncDeviceId, 'Device ID')}>
            <Text style={styles.deviceIdText} numberOfLines={2}>
              {formatDeviceId(syncDeviceId)}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {syncVaultId && (
        <View style={styles.infoSection}>
          <Text style={styles.infoLabel}>Vault ID:</Text>
          <Text style={styles.infoValue}>{syncVaultId}</Text>
        </View>
      )}

      {syncConfigured ? (
        <>
          <View style={styles.statusSection}>
            <View style={styles.statusRow}>
              <Ionicons
                name={
                  syncStatus.status === 'synced'
                    ? 'checkmark-circle'
                    : syncStatus.status === 'syncing'
                    ? 'sync'
                    : syncStatus.status === 'error'
                    ? 'alert-circle'
                    : 'ellipse-outline'
                }
                size={20}
                color={
                  syncStatus.status === 'synced'
                    ? '#a6e3a1'
                    : syncStatus.status === 'error'
                    ? '#f38ba8'
                    : '#7f849c'
                }
              />
              <Text
                style={[
                  styles.statusText,
                  syncStatus.status === 'synced' && styles.syncedText,
                  syncStatus.status === 'error' && styles.errorText,
                ]}
              >
                {syncStatus.status === 'synced'
                  ? 'Synced'
                  : syncStatus.status === 'syncing'
                  ? 'Syncing...'
                  : syncStatus.status === 'error'
                  ? 'Error'
                  : 'Disconnected'}
              </Text>
            </View>

            {syncStatus.lastSync && (
              <Text style={styles.lastSyncText}>
                Last sync: {syncStatus.lastSync.toLocaleString()}
              </Text>
            )}

            {syncStatus.memberCount !== undefined && syncStatus.memberCount > 0 && (
              <Text style={styles.memberText}>
                {syncStatus.memberCount} device{syncStatus.memberCount !== 1 ? 's' : ''} in vault
              </Text>
            )}

            {syncStatus.pendingCount !== undefined && syncStatus.pendingCount > 0 && (
              <Text style={styles.pendingText}>
                {syncStatus.pendingCount} pending push{syncStatus.pendingCount !== 1 ? 'es' : ''}
              </Text>
            )}
          </View>

          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.button}
              onPress={() => setMode('setup')}
            >
              <Ionicons name="settings-outline" size={20} color="#cdd6f4" />
              <Text style={styles.buttonText}>Setup Sync</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              onPress={handleSyncNow}
              disabled={loading}
            >
              <Ionicons name="sync-outline" size={20} color="#cdd6f4" />
              <Text style={styles.buttonText}>Sync Now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                setGeneratedInvite('');
                setTargetDeviceId('');
                setMode('invite');
              }}
            >
              <Ionicons name="person-add-outline" size={20} color="#cdd6f4" />
              <Text style={styles.buttonText}>Invite Device</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.dangerButton]}
              onPress={handleLeaveVault}
            >
              <Ionicons name="exit-outline" size={20} color="#f38ba8" />
              <Text style={[styles.buttonText, styles.dangerText]}>Leave Vault</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.notConfiguredText}>
            Sync is not configured. Set up cloud sync to access your vault from multiple devices.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setMode('setup')}
          >
            <Ionicons name="cloud-outline" size={20} color="#1e1e2e" />
            <Text style={styles.primaryButtonText}>Setup Sync</Text>
          </TouchableOpacity>
        </>
      )}

      {statusMessage ? (
        <Text style={[styles.statusMessage, isError && styles.errorMessage]}>
          {statusMessage}
        </Text>
      ) : null}

      {loading && <ActivityIndicator style={styles.loader} color="#89b4fa" />}
    </ScrollView>
  );

  const renderSetup = () => (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => setMode('list')}>
        <Ionicons name="arrow-back" size={24} color="#cdd6f4" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Setup Cloud Sync</Text>

      {syncDeviceId && (
        <View style={styles.infoSection}>
          <Text style={styles.infoLabel}>Your Device ID:</Text>
          <TouchableOpacity onPress={() => copyToClipboard(syncDeviceId, 'Device ID')}>
            <Text style={styles.deviceIdText} numberOfLines={2}>
              {formatDeviceId(syncDeviceId)}
            </Text>
          </TouchableOpacity>
          <Text style={styles.hint}>Share this with the vault owner to receive an invite</Text>
        </View>
      )}

      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Server URL</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="https://forgor.example.com"
          placeholderTextColor="#7f849c"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.optionsSection}>
        <Text style={styles.optionsLabel}>Options:</Text>

        <TouchableOpacity
          style={styles.optionButton}
          onPress={handleSetupCreate}
          disabled={loading}
        >
          <Ionicons name="add-circle-outline" size={20} color="#89b4fa" />
          <Text style={styles.optionButtonText}>Create New Vault</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionButton}
          onPress={handleGoToJoin}
          disabled={loading}
        >
          <Ionicons name="enter-outline" size={20} color="#89b4fa" />
          <Text style={styles.optionButtonText}>Join Existing Vault</Text>
        </TouchableOpacity>
      </View>

      {statusMessage ? (
        <Text style={[styles.statusMessage, isError && styles.errorMessage]}>
          {statusMessage}
        </Text>
      ) : null}

      {loading && <ActivityIndicator style={styles.loader} color="#89b4fa" />}
    </ScrollView>
  );

  const renderJoin = () => (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => setMode('setup')}>
        <Ionicons name="arrow-back" size={24} color="#cdd6f4" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Join Vault</Text>

      {syncDeviceId && (
        <View style={styles.infoSection}>
          <Text style={styles.infoLabel}>Your Device ID (registered with server):</Text>
          <TouchableOpacity onPress={() => copyToClipboard(syncDeviceId, 'Device ID')}>
            <Text style={styles.deviceIdText} numberOfLines={2}>
              {formatDeviceId(syncDeviceId)}
            </Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Tap to copy. Send this to the vault owner so they can generate an invite code for you.
          </Text>
        </View>
      )}

      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Invite Code</Text>
        <TextInput
          style={styles.input}
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="Paste the invite code from the vault owner"
          placeholderTextColor="#7f849c"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleJoinVault}
        disabled={loading}
      >
        <Text style={styles.primaryButtonText}>Join Vault</Text>
      </TouchableOpacity>

      {statusMessage ? (
        <Text style={[styles.statusMessage, isError && styles.errorMessage]}>
          {statusMessage}
        </Text>
      ) : null}

      {loading && <ActivityIndicator style={styles.loader} color="#89b4fa" />}
    </ScrollView>
  );

  const renderInvite = () => (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => setMode('list')}>
        <Ionicons name="arrow-back" size={24} color="#cdd6f4" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Invite Device</Text>

      {syncDeviceId && (
        <View style={styles.infoSection}>
          <Text style={styles.infoLabel}>Your Device ID:</Text>
          <TouchableOpacity onPress={() => copyToClipboard(syncDeviceId, 'Device ID')}>
            <Text style={styles.deviceIdText} numberOfLines={2}>
              {formatDeviceId(syncDeviceId)}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Target Device ID</Text>
        <TextInput
          style={styles.input}
          value={targetDeviceId}
          onChangeText={setTargetDeviceId}
          placeholder="Enter the 64-character device ID"
          placeholderTextColor="#7f849c"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.warningBox}>
        <Ionicons name="warning-outline" size={20} color="#fab387" />
        <Text style={styles.warningText}>
          This will allow the target device to access your vault. Only invite devices you trust.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleInviteDevice}
        disabled={loading}
      >
        <Ionicons name="send-outline" size={20} color="#1e1e2e" />
        <Text style={styles.primaryButtonText}>Generate Invite</Text>
      </TouchableOpacity>

      {generatedInvite ? (
        <View style={styles.inviteResultSection}>
          <Text style={styles.inviteResultLabel}>Share this invite code:</Text>
          <TouchableOpacity
            style={styles.inviteCodeBox}
            onPress={() => copyToClipboard(generatedInvite, 'Invite code')}
          >
            <Text style={styles.inviteCodeText}>{generatedInvite}</Text>
            <Ionicons name="copy-outline" size={20} color="#89b4fa" />
          </TouchableOpacity>
          <Text style={styles.hint}>
            The recipient should use this code to join the vault.
          </Text>
        </View>
      ) : null}

      {statusMessage ? (
        <Text style={[styles.statusMessage, isError && styles.errorMessage]}>
          {statusMessage}
        </Text>
      ) : null}

      {loading && <ActivityIndicator style={styles.loader} color="#89b4fa" />}
    </ScrollView>
  );

  switch (mode) {
    case 'setup':
      return renderSetup();
    case 'join':
      return renderJoin();
    case 'invite':
      return renderInvite();
    default:
      return renderList();
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e2e',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#cdd6f4',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#7f849c',
    marginBottom: 24,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backText: {
    color: '#cdd6f4',
    fontSize: 16,
    marginLeft: 8,
  },
  infoSection: {
    marginBottom: 20,
  },
  infoLabel: {
    fontSize: 12,
    color: '#7f849c',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#a6e3a1',
    fontFamily: 'monospace',
  },
  deviceIdText: {
    fontSize: 12,
    color: '#a6e3a1',
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  hint: {
    fontSize: 12,
    color: '#7f849c',
    marginTop: 8,
    fontStyle: 'italic',
  },
  statusSection: {
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 16,
    color: '#7f849c',
    marginLeft: 8,
  },
  syncedText: {
    color: '#a6e3a1',
  },
  errorText: {
    color: '#f38ba8',
  },
  lastSyncText: {
    fontSize: 12,
    color: '#7f849c',
    marginTop: 4,
  },
  memberText: {
    fontSize: 12,
    color: '#7f849c',
    marginTop: 4,
  },
  pendingText: {
    fontSize: 12,
    color: '#fab387',
    marginTop: 4,
  },
  buttonGroup: {
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  buttonText: {
    color: '#cdd6f4',
    fontSize: 16,
  },
  dangerButton: {
    borderColor: '#f38ba8',
    borderWidth: 1,
  },
  dangerText: {
    color: '#f38ba8',
  },
  notConfiguredText: {
    fontSize: 14,
    color: '#7f849c',
    marginBottom: 24,
    lineHeight: 22,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#89b4fa',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginTop: 16,
  },
  primaryButtonText: {
    color: '#1e1e2e',
    fontSize: 16,
    fontWeight: '600',
  },
  inputSection: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#cdd6f4',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 16,
    color: '#cdd6f4',
    fontSize: 16,
  },
  optionsSection: {
    marginTop: 24,
  },
  optionsLabel: {
    fontSize: 14,
    color: '#cdd6f4',
    marginBottom: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 12,
  },
  optionButtonText: {
    color: '#89b4fa',
    fontSize: 16,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(250, 179, 135, 0.1)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    color: '#fab387',
    fontSize: 14,
    lineHeight: 20,
  },
  inviteResultSection: {
    marginTop: 24,
  },
  inviteResultLabel: {
    fontSize: 14,
    color: '#cdd6f4',
    marginBottom: 12,
  },
  inviteCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 16,
    borderColor: '#a6e3a1',
    borderWidth: 1,
  },
  inviteCodeText: {
    flex: 1,
    color: '#a6e3a1',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  statusMessage: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(166, 227, 161, 0.1)',
    borderRadius: 8,
    color: '#a6e3a1',
    textAlign: 'center',
  },
  errorMessage: {
    backgroundColor: 'rgba(243, 139, 168, 0.1)',
    color: '#f38ba8',
  },
  loader: {
    marginTop: 20,
  },
});
