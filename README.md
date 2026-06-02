# NAME.md

`NAME.md` is a lightweight Markdown editor built with React, TipTap, and Tauri.
The name stands for **Not Another Markdown Editor**.

It is designed for local-first writing, with optional GitHub-backed document libraries for syncing Markdown files through your own repository.

## Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Desktop Builds](#desktop-builds)
- [Linux Builds](#linux-builds)
- [Android Builds](#android-builds)
- [GitHub Libraries](#github-libraries)
- [Common Commands](#common-commands)
- [Troubleshooting](#troubleshooting)
- [Attribution](#attribution)

## Features

- WYSIWYG Markdown editing
- Local draft and local file support
- Local folder libraries
- Optional GitHub-backed Markdown library
- GitHub OAuth device-flow sign-in
- Save locally/cache first, then sync to GitHub
- Visual table editing with stable column widths
- Light, warm, and dark themes
- Desktop and Android builds through Tauri

## Tech Stack

- Frontend: React 19, TypeScript, Vite
- Editor: TipTap / ProseMirror
- Desktop/mobile shell: Tauri 2
- Native layer: Rust
- Icons: Lucide React

## Repository Structure

```text
.
├── src/                         React application source
├── public/                      Static web assets
├── src-tauri/                   Tauri/Rust source and config
│   ├── src/                     Rust commands/native bridge
│   ├── capabilities/            Tauri permissions
│   ├── icons/                   Generated app icon set
│   └── gen/android/             Tauri Android project source/config
├── package.json                 npm scripts and dependencies
├── package-lock.json            locked npm dependency graph
└── vite.config.ts               Vite config
```

Generated build folders are intentionally ignored, especially:

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `src-tauri/gen/android/.gradle/`
- `src-tauri/gen/android/app/build/`
- `src-tauri/gen/android/app/src/main/jniLibs/`

## Prerequisites

Install:

- Node.js 22 or newer
- npm 11 or newer
- Rust stable with Cargo
- Platform-native Tauri build dependencies

Check versions:

```bash
node --version
npm --version
rustc --version
cargo --version
```

### Windows

Install:

- Visual Studio 2022 Build Tools or Visual Studio with `Desktop development with C++`
- Microsoft Edge WebView2 Runtime
- Rust MSVC toolchain

Useful setup commands:

```bash
rustup default stable-x86_64-pc-windows-msvc
rustup target add x86_64-pc-windows-msvc
```

### Ubuntu

Install:

- `build-essential`
- `curl`
- `wget`
- `file`
- `libwebkit2gtk-4.1-dev`
- `libappindicator3-dev`
- `librsvg2-dev`
- `patchelf`

Example:

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  curl \
  wget \
  file \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf
```

### Fedora

Install:

- `gcc`
- `gcc-c++`
- `make`
- `webkit2gtk4.1-devel`
- `libappindicator-gtk3-devel`
- `librsvg2-devel`
- `patchelf`
- `rpm-build`

Example:

```bash
sudo dnf install -y \
  gcc \
  gcc-c++ \
  make \
  webkit2gtk4.1-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  patchelf \
  rpm-build
```

### Android

Install:

- Android Studio
- Android SDK Platform and Build-Tools
- Android SDK Command-line Tools
- JDK 17 or Android Studio's bundled JBR
- Rust Android targets

Rust targets:

```bash
rustup target add \
  aarch64-linux-android \
  armv7-linux-androideabi \
  i686-linux-android \
  x86_64-linux-android
```

Tauri mobile uses the Android project under `src-tauri/gen/android/`.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the web frontend:

```bash
npm run dev
```

Run the desktop app in development mode:

```bash
npm run tauri:dev
```

## Desktop Builds

Build the frontend only:

```bash
npm run build
```

Build the desktop app for the current platform:

```bash
npm run tauri:build
```

On Windows this produces installer bundles under:

```text
src-tauri/target/release/bundle/
```

Typical Windows outputs:

- `src-tauri/target/release/bundle/nsis/NAME.md_0.1.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/NAME.md_0.1.0_x64_en-US.msi`

## Linux Builds

Build Linux desktop packages on the target Linux environment:

```bash
npm run tauri:build
```

Typical outputs are written under:

```text
src-tauri/target/release/bundle/
```

Depending on the distro and installed packaging tools, Linux outputs may include:

- AppImage
- Debian package (`.deb`)
- RPM package (`.rpm`)

Ubuntu and Fedora builds have been produced, but runtime testing is still needed on target systems.

## Android Builds

Build Android release artifacts:

```bash
npm run tauri -- android build
```

Typical outputs:

- Unsigned APK: `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk`
- AAB: `src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab`

For direct device install, the release APK must be aligned and signed. For local testing on Windows, the Android debug keystore can be used:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\zipalign.exe" -p -f 4 `
  "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk" `
  "src-tauri\gen\android\app\build\outputs\apk\universal\release\NAME.md-universal-release-aligned.apk"

& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\apksigner.bat" sign `
  --ks "$env:USERPROFILE\.android\debug.keystore" `
  --ks-key-alias androiddebugkey `
  --ks-pass pass:android `
  --key-pass pass:android `
  --out "src-tauri\gen\android\app\build\outputs\apk\universal\release\NAME.md-universal-release-debug-signed.apk" `
  "src-tauri\gen\android\app\build\outputs\apk\universal\release\NAME.md-universal-release-aligned.apk"
```

For public distribution, use your own release keystore instead of the debug keystore.

## GitHub Libraries

The app can use GitHub as an optional Markdown file store.

Current behavior:

- GitHub OAuth Device Flow sign-in
- Default private library repo: `name.md-files`
- Default document root: `docs`
- Default assets root: `assets`
- Files are cached locally before syncing
- GitHub sync uses file SHAs for remote-change/conflict detection

The app includes its GitHub OAuth App client ID so normal users can connect by selecting `Connect GitHub`.
The OAuth client secret is not embedded and is not required for GitHub Device Flow.
Advanced Settings can still override the client ID for custom builds.

## Common Commands

```bash
npm install
npm run lint
npm run dev
npm run tauri:dev
npm run build
npm run tauri:build
npm run tauri -- android build
```

## Troubleshooting

### `npm install` fails

Check Node.js and npm versions:

```bash
node --version
npm --version
```

### Windows build fails

Confirm Visual Studio C++ Build Tools, the Rust MSVC toolchain, and WebView2 are installed.

If the build cannot replace `src-tauri/target/release/app.exe`, close any running `NAME.md` desktop app and rebuild.

### Linux build fails

This usually means one or more native GTK/WebKit or packaging dependencies are missing. Recheck the Ubuntu or Fedora prerequisite package list above.

### Android build fails

Confirm Android Studio, SDK Build-Tools, SDK Command-line Tools, JDK/JBR, NDK, and Rust Android targets are installed.

If signing fails, check the installed Build-Tools version and adjust the `36.1.0` path in the signing commands.

## Attribution

This project took UX inspiration from `markdown-for-humans` by Concretios:

- https://github.com/concretios/markdown-for-humans
