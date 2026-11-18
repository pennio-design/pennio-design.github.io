# PENNIO Studio — Product Requirements Document

**Document status:** Product authority  
**Last updated:** 18 November 2026  
**Repository:** `pennio-design/pennio-design.github.io`  
**Application route:** `/studio/`  
**Companion guide:** [Studio Build Guide](./studio-build-guide.md)

## 1. Product definition

PENNIO Studio is a mobile-first creative workspace for African music, language, writing and visual storytelling. It gives creators a practical place to capture raw ideas, shape them into creative work, organise projects and return to work without losing context.

The current music-production focus is Àyàn. The wider Studio must preserve distinct creative experiences and clear hand-offs between them. Àtẹ́wọ́ remains its own body-percussion experience. It must not be reduced to a clap lane inside Àyàn or treated as another name for lù'lù.

## 2. Product principles

1. **Mobile-first creation.** Primary workflows must work on narrow Android screens, with desktop and tablet layouts gaining space rather than changing the interaction model.
2. **Creative continuity.** A recording, pattern, project, media asset or editing session must survive navigation, refresh and reasonable interruption. Save and recovery states must be visible.
3. **Source preservation.** Original recordings remain available as original media. Derived beats, transcriptions, edits and mixes are separate, editable outputs.
4. **Clear ownership.** Every project asset must have a known project association and a predictable storage location.
5. **No silent processing.** Long-running actions show a clear loading/progress state, useful status text and a completion or failure result. Playback must not become an unexplained frozen control.
6. **Track-level control.** Tools and actions belong beside the track they affect. Avoid global selection modes when a tool can be launched in the context of its target track.
7. **Cultural and musical specificity.** Yoruba names, instruments, tone and rhythmic ideas must be represented accurately and consistently.
8. **Honest capability claims.** A first-pass transcription or heuristic must not be described as a trained classifier, professional pitch tracker or finished production result.

## 3. Studio information architecture

The Studio shell provides room navigation, a collapsible workspace/sidebar system, project context and shared media access.

Core creative experiences must remain distinct:

- **Àyàn:** music creation, beat-making, recording, arrangement and mixing.
- **Àtẹ́wọ́:** a dedicated body-percussion experience. It is a separate layer/room, not a generic clap category or a lù'lù instrument lane.
- **Akéwì:** writing and language-led creative work.
- **Fàájíplace:** film and visual storytelling workflows.
- **Model / Beauty:** retain as a distinct Studio destination where present in the application.

Room transitions must preserve the active project and must not silently replace another room's session. Shared uploads and project media should be reachable from the workspace without erasing room-specific organisation.

## 4. Àyàn and Ìlù music workflow

### 4.1 Beat creation

Users must be able to create and edit beats using the available instrument lanes and step grid. The grid must use available width, remain readable on mobile and support the active sequence length without horizontal clipping.

Track tools must be available in the tools panel associated with each beat track. The tool context must make the target track explicit. Do not reintroduce a separate global selection mode as a prerequisite for track actions.

The Ìlù naming must be used consistently for the relevant beat-making engine/experience. Do not substitute the mistaken label “You”.

### 4.2 Voice as a musical input

A user must be able to use their voice to create musical material. Supported creative intents are:

- **Beatbox:** detect vocal attacks and map them to rhythmic events.
- **Beat:** capture a vocalised or spoken rhythmic pattern and turn its timing into editable beat events.
- **Hum:** detect a hummed pitch contour and map it to available musical pitch states.
- **Tune:** detect sung notes and quantise them against the selected key and scale.
- **Melody:** turn a sung or hummed phrase into an editable melodic sequence.

The original voice recording must be retained as audio in the project/session. Generated events or notes must remain editable and must not overwrite or replace the source recording. Where transcription is uncertain, expose the result for user correction rather than presenting it as definitive.

**Current implementation boundary:** the current PR #54 draft describes Beatbox, Hum and Tune as first-pass modes. Beatbox maps detected attacks to steps; Hum maps pitch contour to available pitch states; Tune quantises detected notes to the selected key and scale. The broader Beat and Melody intents remain product requirements until their distinct behaviour is implemented and verified. This is a heuristic first pass, not full polyphonic pitch tracking or a trained beatbox classifier.

### 4.3 Recording level and intelligibility

Recorded voice must be audible at a useful level relative to playback. The capture and monitoring path must avoid recordings that are technically present but too quiet to hear.

Requirements:

- Provide a reliable input-level path, including appropriate gain staging and normalisation or level correction where needed.
- Preserve headroom and avoid clipping; do not solve quiet recordings by blindly maximising every source.
- Keep original captured audio intact. Store any processed or level-adjusted version as a derived asset where destructive processing would otherwise occur.
- Make input level and recording state observable before and during capture.
- Verify microphone permission, device input selection where available, capture constraints, playback gain and export loudness as separate parts of the signal path.
- Test on real Android devices as well as desktop browsers.

A low recording level is a release-blocking defect when it makes the user's performance difficult or impossible to hear.

## 5. lù'lù (lù ìlù) percussion rhythm tool

lù'lù is an interactive percussion-pattern tool within Àyàn. It provides a direct way to build a rhythm from Yoruba and related percussion voices.

The current PR #54 draft specifies seven lanes: Dùndún, Bàtá, Agogo, Ṣẹ̀kẹ̀rẹ̀, Udu, Dùrù and Àtẹ́wọ́. The Àtẹ́wọ́ lane in a lù'lù pattern must not be confused with the separate Àtẹ́wọ́ Studio experience; the room remains an independent creative layer.

Required behaviour:

- Tap a step to add a hit and cycle its hit strength.
- Support 12-step and 16-step patterns.
- Preview the rhythm using the active Àyàn tempo and swing.
- Stop or coordinate playback so lù'lù preview and the main DAW transport never play over one another.
- Send a pattern into the corresponding Àyàn Beat lanes.
- Keep sent events editable through the existing track tools and grid.
- Persist the pattern with the correct project and restore it when that project is reopened.
- Show clear preview, stop, saving and error states.

The pattern is project data. Sending it to Beat must not discard the original lù'lù pattern.

## 6. Tracks, recording and DAW

The DAW must support distinct tracks/layers for source vocals, generated patterns and other musical material. A vocal take must not be flattened into an unrelated beat lane or silently replace another take.

Track requirements:

- Track identity, role and musical context remain clear.
- Track-level tools operate on the intended track only.
- Track metadata such as source, role, key, note/chord, tempo and notes must persist with the session where supported.
- Mute, solo, volume, pan, timing and editing operations must not mutate source media unexpectedly.
- Undo/redo and checkpoints must restore both arrangement state and the relevant media references.
- Playback, import, generation and mix rendering must have distinct visible states.
- Competing playback systems must be coordinated. Starting a preview must stop or suspend conflicting transport playback.

Recording requirements:

- Permission requests and capture startup must be observable.
- The UI must wait for the recorder to be ready before treating capture as started.
- Stop, cancel, retry and cleanup paths must release media resources.
- Recorded audio must be saved intact and remain separately identifiable.
- Session recovery must restore the recording reference and its relationship to the project.

## 7. Projects, workspace and persistence

A project is the organising unit for creative work. It must hold its metadata, artwork, sessions and media references.

Current implementation foundations include browser-local project metadata and IndexedDB media storage. The current PR #54 draft adds project artwork, profile editing, a recent-video showcase, an explicit Save control and workspace/sidebar work. Profile fields are currently browser-local; do not claim cloud profile synchronisation.

Requirements:

- Project switching must restore the correct room/session without cross-project media leakage.
- Media writes must complete before a save is reported as complete.
- Explicit Save must flush the current room session, DAW session and pending media writes.
- Project deletion must handle dependent assets and references safely, with clear confirmation.
- Backup export/import and recovery paths must remain available and be regression-tested after storage changes.
- Browser-local persistence and cloud persistence must be described separately. Do not claim cloud sync unless it is implemented and verified.

## 8. Loading, feedback and accessibility

Every action that takes meaningful time must communicate what is happening. This includes voice analysis, beat generation, imports, project switching, media writes, playback preparation and mix rendering.

Progress feedback must:

- Appear immediately after the user starts the action.
- Use plain language that describes the current operation.
- Prevent duplicate or conflicting actions where required.
- Keep the user oriented without implying a false completion time.
- Report success or failure and provide a sensible recovery action.

Controls must have accessible names, visible focus, sufficient contrast and touch targets appropriate for mobile use. Light and dark themes must both be checked. Reduced-motion preferences must be respected.

## 9. Export and sharing

The product direction includes usable audio export and sharing. Export must preserve the intended mix and produce an audible, correctly encoded file. MP3/WAV, WhatsApp sharing and groove-link collaboration are product directions; each must be labelled as available only after the corresponding implementation and end-to-end verification.

Never report an export, share or sync as successful based only on a button click.

## 10. Release acceptance criteria

A feature is not complete because its markup exists or its helper function passes a synthetic test.

Before a release candidate is approved:

- Verify desktop, tablet and narrow Android layouts.
- Test real microphone capture, playback and exported audio on physical devices.
- Confirm recordings are audible, intact and retained as separate source layers.
- Verify voice-to-beat modes independently, including uncertain or noisy input.
- Verify lù'lù editing, preview, transport coordination, project persistence and Send to Beat.
- Verify project switching, explicit save, reload recovery, media ownership and backup flows.
- Verify tools operate on the intended track and do not affect neighbouring tracks.
- Check light/dark contrast, loading/error states, keyboard access and touch interaction.
- Run syntax/static checks and inspect the complete diff for unintended adjacent changes.
- Record what was tested, what was not tested and any remaining limitations.

No unverified change should be merged or deployed.

## 11. Current delivery status and known gaps

The current working product branch is represented by draft PR #54, “Restore PENNIO Studio baseline and project showcase”, based on current `master`. It includes the shell, profile and artwork work, video showcase, explicit Save, track-level Beatbox/Hum/Tune hand-off and lù'lù sequencer.

PR #54 explicitly records that browser/device interaction tests have not yet been run. Real microphone and playback behaviour, mobile layout, project switching, artwork/video flows and save behaviour still require physical/browser QA. The vocal translation is a first-pass heuristic. In-app AI artwork generation and cloud profile synchronisation are not implemented. The separate Àtẹ́wọ́ experience still requires its own proper navigation and view.

Treat these as open verification or implementation items, not completed capabilities.
