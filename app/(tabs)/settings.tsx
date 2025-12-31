import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';

export default function SettingsScreen() {
  const { regenerateDeviceKeys, lock, resetApp } = useApp();
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const handleRegenerateKeys = useCallback(() => {
    Alert.alert(
      '⚠️ Regenerate Device Keys',
      'This will generate new device keys. You will need to:\n\n' +
        '• Re-register with the sync server\n' +
        '• Request a new invite if you were part of a vault\n' +
        '• Other devices will no longer recognize this device\n\n' +
        'Only do this if your keys are corrupted or you want a fresh start.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await regenerateDeviceKeys();
              setStatusMessage('Device keys regenerated successfully');
              setIsError(false);
            } catch (e) {
              setStatusMessage(e instanceof Error ? e.message : 'Failed to regenerate keys');
              setIsError(true);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }, [regenerateDeviceKeys]);

  const handleLock = useCallback(() => {
    lock();
  }, [lock]);

  const handleResetApp = useCallback(() => {
    Alert.alert(
      '⚠️ Reset this device?',
      'This will:\n' +
        '- Remove this device from the vault locally\n' +
        '- Delete all local passwords, friends, and device keys\n' +
        '- Clear sync configuration and pending data\n\n' +
        'Your sync server data will NOT be deleted.\n' +
        'You will need to set up this device again to rejoin.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset App',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            setStatusMessage('');
            setIsError(false);
            try {
              await resetApp();
            } catch (e) {
              setStatusMessage(e instanceof Error ? e.message : 'Failed to reset app');
              setIsError(true);
            } finally {
              setResetting(false);
            }
          },
        },
      ]
    );
  }, [resetApp]);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>General</Text>
        
        <TouchableOpacity style={styles.button} onPress={handleLock}>
          <Ionicons name="lock-closed-outline" size={20} color="#cdd6f4" />
          <Text style={styles.buttonText}>Lock Vault</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.dangerSectionTitle}>⚠️ Danger Zone</Text>
        <Text style={styles.dangerDescription}>
          These actions can cause data loss or sync issues. Use with caution.
        </Text>

        <TouchableOpacity
          style={[styles.button, styles.dangerButton]}
          onPress={handleRegenerateKeys}
          disabled={loading || resetting}
        >
          <Ionicons name="key-outline" size={20} color="#f38ba8" />
          <View style={styles.buttonContent}>
            <Text style={styles.dangerButtonText}>Regenerate Device Keys</Text>
            <Text style={styles.buttonHint}>
              Creates new cryptographic keys for this device
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.dangerButton]}
          onPress={handleResetApp}
          disabled={loading || resetting}
        >
          <Ionicons name="trash-outline" size={20} color="#f38ba8" />
          <View style={styles.buttonContent}>
            <Text style={styles.dangerButtonText}>Reset App</Text>
            <Text style={styles.buttonHint}>
              Removes this device from the vault and clears all local data
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {statusMessage ? (
        <Text style={[styles.statusMessage, isError && styles.errorMessage]}>
          {statusMessage}
        </Text>
      ) : null}

      {(loading || resetting) && <ActivityIndicator style={styles.loader} color="#89b4fa" />}
    </ScrollView>
  );
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
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7f849c',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dangerSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f38ba8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dangerDescription: {
    fontSize: 12,
    color: '#7f849c',
    marginBottom: 16,
    lineHeight: 18,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 12,
  },
  buttonContent: {
    flex: 1,
  },
  buttonText: {
    color: '#cdd6f4',
    fontSize: 16,
  },
  buttonHint: {
    color: '#7f849c',
    fontSize: 12,
    marginTop: 4,
  },
  dangerButton: {
    borderColor: '#f38ba8',
    borderWidth: 1,
  },
  dangerButtonText: {
    color: '#f38ba8',
    fontSize: 16,
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
