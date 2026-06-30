# NAME.md  **Not Another Markdown Editor**.

`NAME.md` is a desktop Markdown editor built with React, Vite, TipTap, and Tauri.

It is designed for local-first writing, with optional GitHub-backed document libraries for syncing Markdown content through your own repository.

## Changelog

### 0.2.0

- **New: drawings & diagrams.** A from-scratch SVG drawing/diagram engine
  (`@namemd/sketch`, in `packages/sketch`), loosely inspired by Excalidraw but
  extended for project-management brainstorming. Drawings live inline in a
  document (a `sketch` fenced block) and render hand-drawn or clean, theme-aware.
  Beyond freeform shapes/connectors/freehand/text it adds structured diagrams —
  notably **Gantt charts** with a real scheduling model (FS/SS/FF/SF
  dependencies with lag, progress, critical-path / activity-on-node views) plus
  charts, flowcharts, and mind maps. The drawing locks to a clean read view in
  the document and unlocks to a full editor in place.
- **New: collapsible sections** and **callouts** content blocks.
- **Fix: GitHub OAuth client ID is now baked in.** It's no longer an editable
  setting — connecting to GitHub works out of the box.
- **Fix: GitHub sign-in timeout.** The device-flow login now polls immediately
  on returning to the app and on an explicit "Check Now", instead of stalling
  behind the (sometimes inflated) poll interval.

## Features

- Rich Markdown editing powered by TipTap
- Rich content blocks: tables, task lists, **callouts**, **collapsible sections**,
  footnotes, and definition lists
- **Drawings & diagrams** — an in-house, theme-aware vector drawing engine
  (`@namemd/sketch`) embedded directly in documents: hand-drawn or clean shapes,
  connectors, freehand, and text, plus structured diagrams (Gantt with a
  critical-path/dependency model, charts, flowcharts, mind maps) aimed at
  project-management brainstorming
- Local file editing with open, save, rename, move, and delete actions
- Local folder libraries for browsing Markdown collections
- Optional GitHub library support using your own repository (OAuth client ID is
  baked in — just connect, nothing to configure)
- Light, warm, and dark themes
- Desktop packaging through Tauri for macOS, Windows, and Linux, plus Android

## Tech stack

- Frontend: React 19, TypeScript, Vite
- Editor: TipTap with Markdown support
- Desktop shell: Tauri 2
- Native layer: Rust

## Repository structure

```text
.
├── src/                 Frontend application code
├── packages/sketch/     @namemd/sketch drawing/diagram engine (in-repo workspace)
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

### Windows release

Must be built on Windows. With `bundle.targets` set to `all`, a normal build
produces both an MSI (WiX) and an NSIS setup `.exe`:

```powershell
npm run tauri:build
```

To build only the MSI:

```powershell
npm run tauri build -- --bundles msi
```

Outputs:

- `.msi` — `src-tauri\target\release\bundle\msi\NAME.md_<version>_x64_en-US.msi`
- `.exe` (NSIS setup) — `src-tauri\target\release\bundle\nsis\NAME.md_<version>_x64-setup.exe`

WiX and NSIS are downloaded automatically on the first build. The installers are
unsigned unless you configure an Authenticode certificate, so Windows SmartScreen
will warn on first run.

### Android release

Requires the Android SDK/NDK and JDK 17 (see the Android prerequisites above).
Build a release APK for 64-bit devices:

```bash
npm run tauri -- android build --apk --target aarch64
```

Output:

- `.apk` — `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`

Release APKs must be signed to install. Create
`src-tauri/gen/android/keystore.properties` (gitignored — never commit it)
pointing at your keystore:

```properties
storeFile=/absolute/path/to/your-release.jks
storePassword=…
keyAlias=…
keyPassword=…
```

Generate a keystore once with `keytool -genkeypair -v -keystore your-release.jks
-keyalg RSA -keysize 2048 -validity 10000 -alias <alias>`. Without
`keystore.properties` the release build is left unsigned. Keep the keystore safe
— the same one is required to ship updates that install over an existing build.

## GitHub publishing and releases

This repository includes a GitHub Actions workflow at `.github/workflows/release.yml`.

It builds native release artifacts for:

- macOS on `macos-latest`
- Linux packages on `ubuntu-22.04`

The workflow creates a draft GitHub release and uploads the generated assets.

### Triggering a release

Push a semantic version tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

You can also trigger the workflow manually with `workflow_dispatch` from the GitHub Actions UI.

## Using GitHub-backed libraries

The app can connect to GitHub and use a repository as a Markdown library.

The GitHub OAuth app client ID is **baked into the app** (a client ID is a public
identifier, not a secret), so there's nothing to configure — just **Connect
GitHub** and complete the device flow. To use that flow yourself, you need:

- A GitHub account
- Permission to create or use a repository for your documents

(A build-time `VITE_GITHUB_CLIENT_ID` can override the embedded ID for alternate
deployments.) The app restricts its native HTTP bridge to GitHub API and GitHub
OAuth endpoints.

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
