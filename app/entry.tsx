import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Entry, createEntry, generateRandomBytes } from '../services/types';

export default function EntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { entries, addEntry, updateEntry } = useApp();

  const existingEntry = params.id ? entries.find((e) => e.id === params.id) : null;

  const [website, setWebsite] = useState(existingEntry?.website || '');
  const [username, setUsername] = useState(existingEntry?.username || '');
  const [password, setPassword] = useState(existingEntry?.password || '');
  const [notes, setNotes] = useState(existingEntry?.notes || '');
  const [showPassword, setShowPassword] = useState(false);

  const isEditing = !!existingEntry;

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let result = '';
    const array = generateRandomBytes(20);
    for (let i = 0; i < 20; i++) {
      result += chars[array[i] % chars.length];
    }
    setPassword(result);
  };

  const handleSave = async () => {
    if (!website.trim()) {
      Alert.alert('Error', 'Please enter a website/service name');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }

    try {
      if (isEditing && existingEntry) {
        const updated: Entry = {
          ...existingEntry,
          website: website.trim(),
          username: username.trim(),
          password: password,
          notes: notes.trim(),
          updated_at: new Date().toISOString(),
        };
        await updateEntry(updated);
      } else {
        const entry = createEntry(
          website.trim(),
          username.trim(),
          password,
          notes.trim()
        );
        await addEntry(entry);
      }
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save entry');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="close" size={28} color="#cdd6f4" />
          </TouchableOpacity>
          <Text style={styles.title}>{isEditing ? 'Edit Entry' : 'New Entry'}</Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
            <Ionicons name="checkmark" size={28} color="#89b4fa" />
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Website / Service</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., github.com"
            placeholderTextColor="#6c7086"
            value={website}
            onChangeText={setWebsite}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Username / Email</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., john@example.com"
            placeholderTextColor="#6c7086"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter password"
              placeholderTextColor="#6c7086"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.passwordAction}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color="#7f849c"
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.passwordAction} onPress={generatePassword}>
              <Ionicons name="dice-outline" size={22} color="#89b4fa" />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Any additional notes..."
            placeholderTextColor="#6c7086"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e2e',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#cdd6f4',
  },
  saveButton: {
    padding: 8,
  },
  form: {
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a6adc8',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#cdd6f4',
    borderWidth: 1,
    borderColor: '#45475a',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#313244',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#45475a',
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#cdd6f4',
  },
  passwordAction: {
    padding: 12,
  },
  notesInput: {
    minHeight: 100,
    paddingTop: 12,
  },
});
