# Widget settings consolidation

Status: design synthesized into a specification and published as GitHub issue #21
with the ready-for-agent label. Implementation has not started.

Issue: https://github.com/theviniis/strata-bar/issues/21

## Confirmed decisions

- Move configuration for Agents, Reminders, Audio input, Audio output and
  Music player into the Settings window.
- Give each of these five widgets its own section, using the same names as
  the corresponding widgets.
- Keep everyday actions in the widgets, including volume adjustment, playback
  controls and viewing reminders.
- Agents settings owns agent visibility and integration/hook setup. Sessions,
  responses, permissions and alerts remain in the widget.
- Reminders settings owns Google Calendar credentials and connection management.
  Creating, editing, postponing and completing reminders remain in the widget.
- Audio input/output settings owns Windows/Voicemeeter source and strip/bus
  routing. Windows endpoint selection, volume and mute remain in the widgets.
- Music player settings owns Spotify setup and connection management. Playback,
  progress, volume and favorites remain in the widget.
- Preferences use the existing draft and Apply/Revert flow. Account connections
  and hook activation use explicit buttons with clearly stated immediate effects.
- Remove gear buttons from the widget popups; do not replace them with gear
  shortcuts to Settings.
- Remove duplicate configuration controls from Appearance and Layout. Layout
  retains widget composition and positioning responsibilities.
- All widgets, not only the five listed above, must use Settings as the single
  source of truth for preferences. Widget-local configuration must not diverge
  from the saved configuration managed through Settings.
- Preserve existing per-monitor and per-widget-instance options, edited and saved
  exclusively through Settings. A single source does not require identical values
  on all monitors. Preserve existing global integration/routing constraints.
- Audit every widget for configuration outside Settings and local-only preference
  mutations; consolidate those paths into the existing draft/save flow.
- Unconfigured integrations show textual guidance naming their Settings section,
  without a configuration button in the widget.
- Reorganize existing functionality; do not introduce new integrations or
  preferences. Include persistence, cross-window propagation and native caller
  permission changes needed for the migrated controls to work in Settings.

## Implementation considerations

- Reuse the existing Settings draft and native configuration save mechanism.
- Keep account connection and hook operations explicit and immediate; Revert does
  not undo their external effects. Keep credentials outside configuration JSON.
- Spotify currently restricts callers to bars/overlay; authorize the specific
  Settings operations needed without broadly relaxing native command checks.
- Verify migrated preference persistence and propagation to bars, immediate
  integration operations and the retained everyday widget actions.

## Open decisions

None. Product decisions and testing boundaries are recorded in the published
specification.
