# UI DNA

## Design tokens

- Warm neutral surfaces carry the app shell; amber accents signal primary actions and brand energy.
- Text uses a compact sans-serif scale with high-density defaults and slightly stronger weights for section titles.
- Spacing follows a tight 4–8px rhythm, with larger gaps reserved for section breaks and modal groups.
- Corners stay modest and consistent; elevation is subtle and used for overlays, menus, and focused surfaces.
- Status colors are semantic and restrained: danger, success, and warning appear as supporting signals, not decoration.

## Component patterns

- Modals use stacked sections: concise heading, one short explanatory paragraph, then grouped actions.
- Buttons pair compact icons with labels; primary actions use higher contrast while secondary actions remain quiet.
- Settings groups favor clear labels over dense prose; helper text should explain consequences, not implementation.
- Dense panels rely on borders and surface contrast rather than heavy dividers.
- Repeated action rows should keep visual rhythm stable across languages.

## Interaction & motion

- Hover and active states are short, direct, and low-motion.
- Native/webview controls should feel immediate; avoid extra confirmation unless data may be replaced or lost.
- Destructive or state-replacing actions use confirmation copy that names the consequence plainly.

## Accessibility baseline

- Maintain strong contrast between text, muted text, borders, and warm dark surfaces.
- Keep icon buttons paired with labels or accessible names.
- Preserve keyboard-accessible controls and visible focus affordances.
- Avoid relying on color alone for warnings, errors, or success states.

## Voice & tone

- Copy is practical, direct, and compact; prefer one short sentence over multi-clause explanations.
- Safety notes should state the user-facing consequence first, then the technical caveat only if needed.
- Vietnamese UI copy may mix established product terms like backup, restore, workspace, pane, tab, and profile.
- Avoid promises about external account sessions; say when users may need to sign in again.

## Layout & responsive

- The app is optimized for dense desktop workflows with split panes and compact settings surfaces.
- Modal content should scan quickly: title, short help, actions.
- Long explanations belong in docs or confirmation dialogs, not persistent settings text.

## Anti-patterns

- Do not add long paragraphs to high-frequency settings surfaces.
- Do not imply backup/restore can bypass provider security or guarantee login preservation.
- Do not introduce decorative UI that competes with chat/workspace controls.
- Do not expand copy in one language without keeping the same information hierarchy in others.
