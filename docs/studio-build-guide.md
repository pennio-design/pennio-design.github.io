# PENNIO Studio — Build Guide

**Document status:** Engineering implementation guide  
**Last updated:** 18 November 2026  
**Repository:** `pennio-design/pennio-design.github.io`  
**Default branch:** `master`  
**Studio application:** `studio/`  
**Product authority:** [Studio PRD](./studio-prd.md)

## 1. Development operating rule

Use Codex as the development workspace for PENNIO Studio. Keep repository inspection, implementation, review, testing, pull requests and merge decisions in the Codex workflow. Do not move the work to a separate coding agent or an unrelated environment unless the project owner explicitly changes this rule.

The repository is the source of truth. Work on a dedicated branch, keep changes scoped, open a pull request against `master`, review the diff and verify adjacent flows before merge. Do not deploy an unverified change.

## 2. Repository and application structure

The repository is a static PENNIO website published on the custom domain. The root site uses Jekyll configuration. There is no root `package.json` or established npm build pipeline in the repository snapshot described by the root README.

Relevant paths:

| Path | Responsibility |
|---|---|
| `studio/index.html` | Studio shell, room markup, styles, inline application wiring and entry point |
| `studio/daw.js` | DAW session, tracks, editing and playback behaviour |
| `studio/recording.js` | Shared recording and capture interactions |
| `studio/workspace.js` | Projects, workspace state, IndexedDB media assets and room/session coordination |
| `studio/guide/index.html` | Public-facing Studio usage guide |
| `_config.yml` | Jekyll configuration |
| `README.md` | Repository-level architecture and publishing notes |

The application is a browser-based experience. Preserve the existing static-site architecture unless a separately reviewed architectural decision authorises a change.

## 3. Runtime and persistence model

The current implementation uses browser APIs and static JavaScript modules. Existing foundations include:

- `localStorage` for selected project/workspace metadata and preferences.
- IndexedDB for project media assets.
- Browser media capture APIs for recording.
- Supabase configuration and connectivity in the Studio shell. Do not infer that every record or profile field is cloud-synchronised merely because Supabase is configured.
- Static HTML/CSS/JavaScript delivery through the repository's publishing setup.

Keep storage ownership explicit. Project records, session state, media blobs and UI preferences have different lifecycles. Do not place large audio/video blobs in localStorage. Use the existing media store and references.

When changing persistence:

1. Identify the current schema, keys, indexes and migration behaviour.
2. Preserve existing user data and provide safe migration/default handling.
3. Ensure asynchronous writes finish before reporting Save success.
4. Handle quota errors, unavailable IndexedDB, interrupted writes and stale references.
5. Test project switching, reload, backup export/import and deletion.
6. Do not claim cloud durability when the data remains browser-local.

## 4. Module boundaries

### `studio/index.html`

Owns the Studio document shell and much of the current UI composition. It contains inline scripts as well as references to external modules. Avoid broad rewrites of this large file for isolated behaviour changes. Keep DOM identifiers stable unless every dependent reference is updated.

### `studio/daw.js`

Owns DAW-specific session and track behaviour. Keep source audio separate from generated/editable events. Track tools must receive an explicit target track and mutate only that track. Preserve transport coordination, undo/redo and session serialisation.

### `studio/recording.js`

Owns shared recording interactions. Preserve the capture lifecycle: permission, recorder readiness, start, data collection, stop, preview/use, error handling and resource cleanup. Any change to gain staging must be tested across capture, preview, DAW playback and export. Never overwrite the original take when generating a processed version.

### `studio/workspace.js`

Owns project/workspace coordination and media persistence. Preserve project-scoped asset ownership and safe asynchronous sequencing. Room changes and project changes must not race with pending writes or restore the wrong session.

### `studio/guide/index.html`

This is the public user guide, not the engineering source of truth. Keep it aligned with verified user-facing behaviour. Do not document a planned or unverified feature as currently available.

## 5. Audio engineering invariants

Audio changes are high risk because a visually correct interface can conceal broken capture, playback or persistence.

Maintain these invariants:

- A recorded take is saved as intact source media.
- Voice recordings remain distinct from generated beat events and other tracks.
- Gain correction must raise useful audibility without clipping or destroying dynamics.
- Input level, recording state and processing state are visible to the user.
- A generated vocal pattern references the source take and does not replace it.
- DAW transport, lù'lù preview and other audio previews cannot overlap unintentionally.
- Stop/cancel/error paths release microphone streams, audio nodes and object URLs when no longer needed.
- Exported audio is checked by listening to the actual file, not by checking only that a download completed.

For low recorded voice reports, inspect the complete signal path: device/input selection, browser capture constraints, track gain, processing/normalisation, playback gain and export gain. Do not add a single arbitrary multiplier without measuring the result and checking clipping.

## 6. Voice-to-music implementation

The product supports five voice-led creative intents: Beatbox, Beat, Hum, Tune and Melody.

The current PR #54 draft contains first-pass Beatbox, Hum and Tune behaviour. Treat Beat and Melody as requirements whose separate interaction and output still need implementation unless code and tests demonstrate otherwise.

Implementation guidance:

- Keep the original recording available.
- Separate audio capture from analysis/transcription.
- Make detected events editable after generation.
- Keep confidence/uncertainty visible where practical; never imply perfect transcription.
- Keep generated notes/events associated with the correct project and target track.
- Run independent tests for rhythmic attacks, pitch contour and quantised note output.
- Test real voices, different distances from the microphone, noisy rooms and different Android devices.

This first-pass mapping is heuristic. Do not describe it as full polyphonic pitch tracking or a trained beatbox classifier.

## 7. lù'lù (lù ìlù) implementation

lù'lù is the interactive percussion step sequencer within Àyàn. The current PR #54 draft describes seven lanes: Dùndún, Bàtá, Agogo, Ṣẹ̀kẹ̀rẹ̀, Udu, Dùrù and Àtẹ́wọ́.

Keep the tool's pattern state separate from the DAW's resulting Beat events. Sending a pattern to Beat should copy/translate the events into the appropriate tracks while preserving the editable lù'lù source pattern.

Required checks:

- 12-step and 16-step modes render and edit correctly.
- Hit-strength cycling is deterministic and visible.
- Preview follows the active tempo and swing.
- Starting lù'lù preview stops or suspends conflicting DAW playback, and vice versa.
- Send to Beat maps each percussion lane to its intended track.
- Project switching and reload restore the correct pattern.
- Pending writes complete before Save reports success.

Àtẹ́wọ́ is also a separate Studio experience. Do not collapse that room into the Àtẹ́wọ́ instrument lane in a lù'lù pattern.

## 8. Naming and interface rules

- Use **PENNIO Studio** for the overall workspace.
- Use **Àyàn** for the music room.
- Use **Ìlù** for the relevant beat-making engine/experience label.
- Use **lù'lù (lù ìlù)** for the interactive percussion rhythm tool.
- Keep **Àtẹ́wọ́** as its own body-percussion experience.
- Keep **Akéwì** and **Fàájíplace** as distinct creative rooms.

Track actions belong in the tools panel associated with each beat track. The active target must be unambiguous. Do not add a global selection mode to access track tools.

Use the existing design system and theme variables. Verify light and dark modes, contrast, keyboard focus, touch targets and narrow-screen layouts. Sidebars must remain independently toggleable and must not obscure the active creative surface.

## 9. Progress and interaction feedback

Any operation that can make the interface feel unresponsive must expose its state. This includes recording startup, voice analysis, beat generation, audio import, project switching, media saving, playback preparation and mix rendering.

A progress state must explain what the application is doing, disable conflicting actions where needed, and provide a clear success or failure result. Do not invent exact remaining-time estimates unless the operation can measure them reliably.

Playback controls must communicate playing, paused, stopped, loading and error states. A control changing appearance is not proof that audio is actually playing.

## 10. Codex workflow

Use this sequence for each meaningful change:

1. **Inspect.** Read the current implementation, related modules, latest PR state and relevant history before editing.
2. **Define scope.** State the user-visible defect or requirement, affected files, expected behaviour and explicit non-goals.
3. **Branch.** Create a focused branch from the correct current base. Do not build on a stale release candidate without a deliberate comparison.
4. **Implement.** Make the smallest complete change. Keep product logic in its owning module and avoid unrelated formatting or UI churn.
5. **Review the diff.** Check every changed line and verify no adjacent working flow, data path, storage key or public route was unintentionally altered.
6. **Run checks.** Run available syntax/static checks and focused tests. Do not claim a check passed unless it was actually run.
7. **Exercise adjacent flows.** For audio work, include recording, playback, track editing, save/reload and export as applicable. For workspace work, include project switching, media writes, backup and restore.
8. **Device QA.** Verify real browser interaction on desktop and a physical Android device for microphone, audio and mobile layout changes. Static checks are not substitutes.
9. **Document.** Record what was tested, what was not tested, known limitations and release blockers in the PR.
10. **Pull request.** Open a PR against `master`. Keep it draft while required browser/device QA remains outstanding.
11. **Merge and release.** Merge only after review and required checks pass. Verify the published route and actual user flow after release.

Do not deploy unverified changes. Do not report a merge, deployment or successful user flow unless the relevant system confirms it.

## 11. Validation checklist

### Static and structural

- [ ] Standalone JavaScript modules pass syntax validation.
- [ ] Executable inline scripts in `studio/index.html` parse successfully.
- [ ] No duplicate DOM IDs have been introduced.
- [ ] All referenced script/style/media paths resolve.
- [ ] Diff contains only intended files and changes.
- [ ] Existing public routes and metadata remain intact.

### Audio and recording

- [ ] Microphone permission and recorder readiness work.
- [ ] Recorded voice is audible at a useful level without clipping.
- [ ] Original take is saved intact.
- [ ] Voice source remains a distinct layer.
- [ ] Beatbox, Beat, Hum, Tune and Melody are tested separately according to implementation status.
- [ ] Preview and DAW transport do not overlap.
- [ ] Exported audio is listened to and checked.

### Àyàn and lù'lù

- [ ] Beat grid fits narrow screens and all active steps are accessible.
- [ ] Track tools target the correct track.
- [ ] 12/16-step lù'lù patterns edit and persist.
- [ ] Tempo/swing preview is correct.
- [ ] Send to Beat preserves the source lù'lù pattern.
- [ ] Project switching restores the right session.

### Workspace and projects

- [ ] Explicit Save flushes session and pending media writes.
- [ ] Reload restores the active project and supported session state.
- [ ] Artwork and video assets remain attached to the correct project.
- [ ] Backup export/import and deletion remain functional.
- [ ] Local and cloud persistence are described accurately.

### Interface and release

- [ ] Left/right sidebars toggle and remain usable on mobile.
- [ ] Light and dark themes have sufficient contrast.
- [ ] Loading, progress, success and error states are clear.
- [ ] Keyboard focus and touch targets are usable.
- [ ] Real desktop and Android browser QA is recorded.
- [ ] Remaining gaps are documented before merge.

## 12. Current baseline and caveats

The latest Studio integration available for this documentation update is draft PR #54, branch `feature/project-artwork-video-showcase`, based on current `master`. Its description records static checks for inline JavaScript, `studio/daw.js`, `studio/recording.js` and `studio/workspace.js`, duplicate-ID checks, synthetic vocal-helper checks and checks that existing workspace APIs remain present.

The same PR states that browser/device interaction tests have not been run. Real audio capture/playback, mobile layout, project switching, image/video flows and manual Save still require verification. Its vocal translation is a first-pass heuristic. AI artwork generation and cloud profile synchronisation are not wired. The dedicated Àtẹ́wọ́ experience still needs its own navigation and view.

These limitations remain open until verified in the running application. A passing static check does not close a browser or device QA requirement.
