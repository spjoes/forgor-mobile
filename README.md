# Forgor Mobile

A secure, offline-first password manager for iOS and Android that shares passwords with other devices over your local network.

## Features

- **Encrypted Vault** - All passwords are encrypted locally using NaCl secretbox (XSalsa20-Poly1305)
- **Cross-Platform** - Works on iOS and Android
- **LAN Sharing** - Share passwords securely with other Forgor devices on the same network
- **mDNS Discovery** - Automatically discovers nearby Forgor devices
- **Device Pairing** - Pair with friends/devices to enable password sharing
- **Password Generator** - Generate strong random passwords
- **Dark Theme** - Easy on the eyes

> Please Note: LAN Sharing and mDNS Discovery do NOT work while in an Expo Go based environment. Please build the app natively to use this functionality. There is currently no official release of this app on the App Store or Google Play Store.

## Compatibility

This app is fully compatible with the [Forgor TUI](https://github.com/spjoes/forgor) (Go-based terminal app). They use the same:

- **Encryption**: NaCl box (X25519 + XSalsa20-Poly1305)
- **Service Discovery**: mDNS with `_pwshare._tcp` service type
- **HTTP Protocol**: `GET /whoami` and `POST /share` endpoints
- **Fingerprints**: First 8 bytes of public key as hex

You can share passwords between the mobile app and desktop TUI seamlessly.

> Please Note: you cannot currently sync 1 vault between 2 devices. While this is planned for the future, right now you can only share individual passwords via E2E encrypted LAN Sharing

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- For physical device testing: Xcode (iOS) or Android Studio (Android). Expo Go is not recommended due to lack of LAN Sharing and mDNS compatibility.

### Installation

```bash
cd forgor-mobile
npm install
```

### Development (Expo Go)

```bash
npm start
```

Scan the QR code with Expo Go app. Note: mDNS discovery won't work in Expo Go - you'll need a native build for full functionality.

### Native Build (Full Features)

For mDNS discovery to work, you need a native build:

```bash
# Generate native projects
npx expo prebuild

# iOS (requires macOS + Xcode)
npx expo run:ios

# Android
npx expo run:android
```

## Usage

### First Launch

1. Enter a **device name** (how others will see you on the network)
2. Create a **master password** (this encrypts your vault locally)
3. Tap **Create Vault**

### Adding Passwords

1. Go to the **Vault** tab
2. Tap the **+** button
3. Fill in website, username, password (or tap 🎲 to generate a secure password)
4. Tap ✓ to save

### Sharing Passwords

1. **Pair first**: On both devices, go to **Nearby** tab and tap a device to pair, or enter an IP manually. The IP that your device is located at is displayed in the **Nearby** tab of whichever client you are using.
2. **Share**: After being connected, head over to the **Vault** tab and tap the share icon on any entry
3. **Select recipient**: Choose a paired friend to send the password to

### Receiving Passwords

When someone shares a password with you, it appears at the top of the Vault tab. Tap to accept or reject.

## Project Structure

```
forgor-mobile/forgor/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation
│   │   ├── index.tsx      # Vault (password list)
│   │   ├── nearby.tsx     # Device discovery
│   │   └── friends.tsx    # Paired devices
│   ├── unlock.tsx         # Login/setup screen
│   ├── entry.tsx          # Add/edit password
│   └── share.tsx          # Share password picker
├── services/              # Core business logic
│   ├── types.ts           # TypeScript types
│   ├── crypto.ts          # NaCl encryption
│   ├── storage.ts         # Encrypted vault (AsyncStorage)
│   ├── discovery.ts       # mDNS peer discovery
│   └── sharing.ts         # HTTP client for sharing
├── context/
│   └── AppContext.tsx     # Global state management
└── types/
    └── react-native-zeroconf.d.ts
```

## Security

- **Local-only storage**: Passwords never leave your device unless you explicitly share them
- **End-to-end encryption**: Shared passwords are encrypted with NaCl box before transmission
- **No cloud**: Everything works offline and on your local network only
- **Key derivation**: Master password derives encryption keys using Argon2id (same as Go TUI) when native module is available, with fallback to hash-based KDF in Expo Go based environments

## Tech Stack

- **React Native** with Expo SDK 54
- **Expo Router** for file-based navigation
- **tweetnacl** for cryptography
- **react-native-argon2** for Argon2id key derivation
- **AsyncStorage** for encrypted local storage
- **react-native-zeroconf** for mDNS discovery

## Known Limitations

- mDNS discovery requires a native build (not Expo Go)
- The mobile app can **send** shares but cannot yet **receive** them via HTTP server due to a React Native limitation. This will hopefully be fixed in a future update.
- Argon2id key derivation requires a native build; Expo Go based environments fall back to simplified hash-based KDF
