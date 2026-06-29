## ADDED Requirements

### Requirement: Full backups include app state and pane sessions
The system SHALL create full backup ZIP files that include both WebView2 pane session data and the app state/profile mapping required to reopen panes with their original profile IDs.

#### Scenario: Backup ZIP contains embedded app state
- **WHEN** a user creates a full backup in the desktop app
- **THEN** the generated ZIP MUST contain a reserved metadata entry with the serialized app state/profile mapping
- **AND** the ZIP MUST contain the pane session directory entries needed by WebView2 profiles

#### Scenario: Sidecar config remains available
- **WHEN** a user creates a full backup in the desktop app
- **THEN** the app MUST continue writing a JSON sidecar next to the ZIP with the same app state content

### Requirement: Restore applies sessions and app state together
The system SHALL restore full backups by applying WebView2 pane session data and the matching app state/profile mapping as one coordinated restore flow.

#### Scenario: Restore from ZIP with embedded app state
- **WHEN** a user restores a full backup ZIP that contains embedded app state
- **THEN** the app MUST stage the WebView2 session data for startup-safe replacement
- **AND** the app MUST stage the embedded app state for frontend application after restart

#### Scenario: Restore from older ZIP with sidecar app state
- **WHEN** a user restores a full backup ZIP that does not contain embedded app state
- **AND** a same-basename JSON sidecar exists next to the ZIP
- **THEN** the app MUST use the sidecar JSON as the app state/profile mapping for restore

#### Scenario: Restore without available app state
- **WHEN** a user restores a full backup ZIP with no embedded app state and no usable sidecar JSON
- **THEN** the app MUST restore the session data when valid
- **AND** the app MUST warn that app layout/profile mapping could not be restored

### Requirement: Restored app state is applied before native webviews start
The system SHALL prevent native child webviews from being created or navigated with stale app state while startup restore results are being processed.

#### Scenario: Startup restore result includes app state
- **WHEN** the app starts after a staged full restore
- **AND** native startup applies the restored session directory
- **THEN** the frontend MUST apply the restored app state before native webviews are allowed to create or navigate tabs

#### Scenario: Startup restore result has no app state
- **WHEN** the app starts after a restore that did not include app state
- **THEN** the frontend MUST finish startup restore processing and allow native webviews to start from the existing app state
- **AND** the user MUST receive a warning explaining that profile mapping was not restored

### Requirement: Restore reports validation details
The system SHALL report full restore results with separate session, app state, and validation status so users can distinguish file restore success from profile mapping issues. The system SHALL describe restored site sessions as best-effort: another computer or Windows user may require re-authentication for Google/Facebook and similar protected providers, while same-machine/same-Windows-user restores may keep sessions only when WebView and site protections allow it.

#### Scenario: Restore succeeds with matching profiles
- **WHEN** startup restore applies session data and app state successfully
- **AND** every pane profile referenced by the restored app state has a corresponding restored session directory or is the default profile
- **THEN** the app MUST report full restore success to the user

#### Scenario: Restore succeeds with missing referenced session directories
- **WHEN** startup restore applies app state successfully
- **AND** one or more pane profile IDs referenced by the app state do not have corresponding restored session directories
- **THEN** the app MUST warn the user which part of restore needs attention without silently reporting complete success

#### Scenario: Restore config is malformed
- **WHEN** the embedded app state or sidecar JSON cannot be parsed as a valid app state
- **THEN** the app MUST avoid replacing the current app state with invalid data
- **AND** the app MUST report the config restore failure while preserving the safe session restore behavior
