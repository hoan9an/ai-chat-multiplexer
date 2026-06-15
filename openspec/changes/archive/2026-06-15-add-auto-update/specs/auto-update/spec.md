## ADDED Requirements

### Requirement: Check for updates from GitHub Releases

The system SHALL check for a newer release using the Tauri updater plugin against the configured GitHub Releases `latest.json` endpoint when running in the Tauri desktop runtime.

#### Scenario: A newer signed release is available

- **WHEN** the user triggers a check from Settings and a newer release exists at the updater endpoint
- **THEN** the system SHALL report an "available" state showing the new version number

#### Scenario: No newer release exists

- **WHEN** the user triggers a check and the installed version is the latest
- **THEN** the system SHALL report a "current" / up-to-date state

#### Scenario: Check fails

- **WHEN** the update check fails (network error, endpoint unreachable, or signature/manifest invalid)
- **THEN** the system SHALL report an "error" state with a human-readable message and SHALL NOT crash

### Requirement: Download and install an update with verification

The system SHALL download the available update, verify its signature against the configured public key, install it, and relaunch the application — without requiring the user to manually download or run an installer.

#### Scenario: User installs an available update

- **WHEN** the user confirms install for an available update
- **THEN** the system SHALL download the artifact while reporting progress, verify its signature, install it, and relaunch the app on the new version

#### Scenario: Signature verification fails

- **WHEN** a downloaded artifact fails signature verification against the configured public key
- **THEN** the system SHALL abort the install, report an error, and leave the current installation unchanged

#### Scenario: Download progress is shown

- **WHEN** an update is downloading
- **THEN** the system SHALL display progress feedback to the user

### Requirement: Graceful fallback outside the desktop runtime

The system SHALL preserve a manual-download fallback when the Tauri updater is unavailable (e.g., the web/browser build).

#### Scenario: Running in a browser

- **WHEN** the app runs outside the Tauri runtime and an update check is triggered
- **THEN** the system SHALL fall back to checking the GitHub API and offer to open the releases page for manual download

### Requirement: Update UI is localized

The system SHALL present all update-related UI text in the active language (Vietnamese, English, Chinese).

#### Scenario: New update states are localized

- **WHEN** any update state (checking, available, downloading, installing, current, error) is displayed
- **THEN** the corresponding text SHALL be available in vi, en, and zh
