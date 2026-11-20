# Archived branches, 20 Nov 2026

60 stale branches were deleted from GitHub after this backup. Every commit they held that is not on master is in branches-2026-11-20.bundle.

Restore one branch:

    git fetch branch-archive/branches-2026-11-20.bundle "refs/remotes/origin/<name>:refs/heads/<name>"

List what is inside: git bundle list-heads branch-archive/branches-2026-11-20.bundle

Branches whose tips were already on master are not listed in the bundle; nothing of theirs was lost.

Deleted:

- audit/seo-recovery-2026-11
- ccr-089c7b5b-42dx9p
- claude/aesthetic-intelligence-engine-oxnlbn
- claude/audit-page-motion-review
- claude/copy-cleanup-em-dashes
- claude/install-design-tools-mobbin-adf6sa
- claude/pennio-brand-positioning-3uuimn
- claude/web-architecture-orchestrator-r4ta4i
- codex/film-write-upgrade
- design/circular-pennio-favicon
- docs/studio-docs-only
- docs/studio-prd-build-guide
- feat/ayan-audacity-daw
- feat/ayan-daw-guided-workflow
- feat/ayan-hum-beatbox-composer
- feat/ayan-timeline-selection
- feat/studio-dashboard
- feat/studio-dashboard-final
- feat/studio-global-recording
- feat/studio-layer-camera-controls
- feat/studio-project-lifecycle
- feat/studio-project-session-recovery
- feat/studio-projects-and-daw-audition
- feat/studio-recording-trim
- feat/studio-shared-workspace
- feat/studio-storage-health
- feat/studio-visual-language
- feat/studio-workspace-floating-panel
- feature/ojugbooro-showcase-carousel
- feature/project-artwork-video-showcase
- feature/studio-beat-workflow-polish
- feature/studio-homepage-showcase
- feature/studio-profile-editor
- feature/studio-two-column-shell
- fix/ayan-daw-audio-routing
- fix/ayan-daw-light-theme
- fix/ayan-fluid-beat-grid
- fix/ayan-fluid-grid-master
- fix/ayan-tablet-responsive-layout
- fix/ile-ere-media-workflows
- fix/light-cards-and-supabase-foundation
- fix/official-pennio-svg-mark
- fix/studio-account-responsive-ui
- fix/studio-auth-root-gate
- fix/studio-first-login-and-inline-controls
- fix/studio-movable-side-panel
- fix/studio-profile-button
- fix/studio-signup-email-delivery
- fix/studio-supabase-auth-flow
- fix/studio-viewport-fit
- fix/workspace-drawer-and-deploy
- fix/workspace-panel-toggle
- refactor/studio-workspace-navigation
- release/studio-stability-candidate
- restore/ayan-grid-merge-to-master
- studio/ayan-visual-pass-1
- studio/speak-once-voice-dock
- studio/zero-gate-first-play
- studio/zero-gate-first-play-v2
- update-studio-name-homepage
