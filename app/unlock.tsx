import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useApp } from '../context/AppContext';

export default function UnlockScreen() {
  const { isInitialized, isUnlocked, initialize, unlock, checkInitialized } = useApp();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkInitialized();
  }, [checkInitialized]);

  if (isUnlocked) {
    return <Redirect href="/(tabs)" />;
  }

  const handleSubmit = async () => {
    if (!password) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }

    setLoading(true);
    try {
      if (isInitialized) {
        await unlock(password);
      } else {
        if (password !== confirmPassword) {
          Alert.alert('Error', 'Passwords do not match');
          setLoading(false);
          return;
        }
        if (!deviceName.trim()) {
          Alert.alert('Error', 'Please enter a device name');
          setLoading(false);
          return;
        }
        await initialize(password, deviceName.trim());
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to unlock vault');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>🔐 Forgor</Text>
        <Text style={styles.subtitle}>
          {isInitialized ? 'Enter your master password' : 'Create a new vault'}
        </Text>

        {!isInitialized && (
          <TextInput
            style={styles.input}
            placeholder="Device Name"
            placeholderTextColor="#6c7086"
            value={deviceName}
            onChangeText={setDeviceName}
            autoCapitalize="none"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Master Password"
          placeholderTextColor="#6c7086"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        {!isInitialized && (
          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            placeholderTextColor="#6c7086"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
          />
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Please wait...' : isInitialized ? 'Unlock' : 'Create Vault'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e2e',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#cdd6f4',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#a6adc8',
    textAlign: 'center',
    marginBottom: 32,
  },
  input: {
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#cdd6f4',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#45475a',
  },
  button: {
    backgroundColor: '#89b4fa',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#1e1e2e',
    fontSize: 18,
    fontWeight: '600',
  },
});
