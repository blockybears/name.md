# NAME.md

`NAME.md` is a desktop Markdown editor built with React, Vite, TipTap, and Tauri.

It is designed for local-first writing, with optional GitHub-backed document libraries for syncing Markdown content through your own repository.

## Features

- Rich Markdown editing powered by TipTap
- Local file editing with open, save, rename, move, and delete actions
- Local folder libraries for browsing Markdown collections
- Optional GitHub library support using your own repository
- Light, warm, and dark themes
- Desktop packaging through Tauri for macOS and Linux

## Tech stack

- Frontend: React 19, TypeScript, Vite
- Editor: TipTap with Markdown support
- Desktop shell: Tauri 2
- Native layer: Rust

## Repository structure

```text
.
├── src/                 Frontend application code
├── src-tauri/           Tauri and Rust desktop application code
├── public/              Static assets
├── dist/                Production frontend build output
└── .github/workflows/   CI and release automation
```

## Prerequisites

You need these tools installed before building the app yourself:

- Node.js 22 or newer
- npm 11 or newer
- Rust stable toolchain with Cargo
- Platform-native build dependencies for Tauri

Recommended version check:

```bash
node --version
npm --version
rustc --version
cargo --version
```

## Platform prerequisites

### macOS

Install:

- Xcode Command Line Tools
- Rust stable
- Node.js and npm

Command:

```bash
xcode-select --install
```

For universal macOS builds, Rust needs both Apple targets:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

### Windows

Install:

- Microsoft Visual Studio C++ Build Tools or Visual Studio with Desktop development for C++
- WebView2
- Rust stable with the MSVC toolchain
- Node.js and npm

Recommended setup:

- Install Visual Studio 2022 with the `Desktop development with C++` workload
- Install the Microsoft Edge WebView2 runtime if it is not already present
- Use the MSVC Rust target, which is the standard Tauri setup on Windows

Helpful commands:

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

Android support requires the standard Tauri mobile toolchain. Install:

- Android Studio
- Android SDK
- Android SDK Platform and Build-Tools
- Java Development Kit 17
- Rust stable
- Node.js and npm

Recommended Android components:

- Android SDK Platform for a recent API level
- Android SDK Command-line Tools
- Android SDK Build-Tools
- Android Emulator if you want local device testing

Rust targets commonly needed for Android:

```bash
rustup target add \
  aarch64-linux-android \
  armv7-linux-androideabi \
  i686-linux-android \
  x86_64-linux-android
```

Notes:

- You will need Android Studio to manage SDK paths and emulator/device setup
- Tauri mobile builds also depend on a correctly configured JDK and Android SDK environment
- This repository already contains generated Android project files under `src-tauri/gen/android/`

## Getting started

Clone the repository and install dependencies:

```bash
git clone <your-repo-url>
cd name.md
npm install
```

Start the frontend in the browser:

```bash
npm run dev
```

Start the desktop app in development mode:

```bash
npm run tauri:dev
```

## Building the app yourself

### Frontend production build

```bash
npm run build
```

This writes the web build to `dist/`.

### Desktop production build

```bash
npm run tauri:build
```

This performs the frontend build and then packages the Tauri desktop app for the current host platform.

## Release builds

Tauri desktop bundles are native-platform builds. In practice:

- macOS releases must be built on macOS
- Ubuntu and Fedora releases must be built on Linux

### macOS release

Builds a universal app bundle and DMG:

```bash
npm run release:mac
```

Outputs:

- `.app`
- `.dmg`

Location:

- `src-tauri/target/universal-apple-darwin/release/bundle/`

### Ubuntu release

Builds AppImage and Debian packages:

```bash
npm run release:ubuntu
```

Outputs:

- `.AppImage`
- `.deb`

Location:

- `src-tauri/target/release/bundle/`

### Fedora release

Builds an RPM package:

```bash
npm run release:fedora
```

Outputs:

- `.rpm`

Location:

- `src-tauri/target/release/bundle/`

### Linux all-in-one release

Builds AppImage, Deb, and RPM in one run:

```bash
npm run release:linux
```

## GitHub publishing and releases

This repository includes a GitHub Actions workflow at `.github/workflows/release.yml`.

It builds native release artifacts for:

- macOS on `macos-latest`
- Linux packages on `ubuntu-22.04`

The workflow creates a draft GitHub release and uploads the generated assets.

### Triggering a release

Push a semantic version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

You can also trigger the workflow manually with `workflow_dispatch` from the GitHub Actions UI.

## Using GitHub-backed libraries

The app can connect to GitHub and use a repository as a Markdown library.

To use that flow yourself, you need:

- A GitHub account
- A GitHub OAuth app client ID
- Permission to create or use a repository for your documents

The app restricts its native HTTP bridge to GitHub API and GitHub OAuth endpoints.

## Development notes

- The frontend is built automatically before Tauri production builds
- The Rust backend provides file system operations and GitHub HTTP requests
- Desktop release artifacts are written under `src-tauri/target/`
- Android project files are generated under `src-tauri/gen/android/`

## Common commands

```bash
npm install
npm run dev
npm run tauri:dev
npm run build
npm run tauri:build
npm run release:mac
npm run release:ubuntu
npm run release:fedora
npm run release:linux
```

## Troubleshooting

### `npm install` fails

Confirm your Node.js and npm versions are current enough:

```bash
node --version
npm --version
```

### Tauri build fails on Linux

This usually means one or more native GTK/WebKit dependencies are missing. Recheck the Ubuntu or Fedora prerequisite package list above.

### macOS build fails

Confirm:

- Xcode Command Line Tools are installed
- both Rust Apple targets are installed
- you are building on macOS

## License

This project is licensed under the MIT License. See `LICENSE`.

## Attribution

This project took inspiration from `markdown-for-humans` by Concretios:

- http://github.com/concretios/markdown-for-humans
