# Strata

Strata presents desktop resource usage in a per-monitor status bar and widget
popups. Memory terminology follows Windows concepts.

## Language

**Audio selection**:
The choice of the Windows input or output device from its widget popup. This
choice is separate from the configured destination of gain and mute controls,
which may use Windows or Voicemeeter.

**Widget settings**:
The preferences and setup options for a widget, grouped in its own section of
Settings. Settings is their single source of truth for every widget, including
any per-monitor or per-instance variations; everyday actions remain available
in the widget itself.

**Draft**:
The settings window's local candidate configuration, shared by the visual and
JSON editors. Editing a draft does not change the native configuration or bars.
Revert reloads the saved configuration and discards unapplied edits.

**Apply**:
The explicit action that validates a draft and sends it to native `config_save`.
Native validation and an atomic write must succeed before configuration events
update the bars. A rejected draft or failed save preserves the saved document.

**Monitor layout**:
The ordered widgets shown in a monitor's left, center and right sections.
Removing a widget from a monitor layout retains its settings for later reuse.

**Default layout**:
The initial widget arrangement inherited by a monitor without its own layout.
Editing an individual monitor layout does not change this starting arrangement.

**Content loop**:
The path from a settings draft through Apply, native persistence and per-window
configuration events to the real bars' rendered content. It includes widget
composition and presentation; native geometry remains tracked separately in #3.

**Widget preview**:
A motionless, read-only illustration of a widget using fixed example readings
and its configured presentation. The studio, catalog and theme selector use
the same examples; a preview never controls the desktop or a player.

**Widget popup**:
A floating view opened from a widget for details and everyday actions, whose
interaction ends when it is closed. Opening another widget popup replaces the
transient view; pinned widget popups remain open.

**Pinned widget popup**:
A widget popup kept open for the current run, above ordinary windows and movable
independently of its widget. Pinning preserves the current interaction; unpinning
restores transient behavior near the widget.

**Music interaction**:
The local set of pending player actions owned by one bar or popup for a specific
player session and track. Closing its owner or changing that identity discards
unsent actions; already submitted actions may still complete.

**Settings window**:
The single-instance native configuration editor opened from the tray at
`?view=settings`. It is captioned, resizable and focusable, with no AppBar
reservation or floating-frame styling. A dialog-frame style excludes it from
komorebi tiling; a second open request focuses the existing window.

**CPU utilization**:
The percentage of aggregate processor time occupied during an observation interval.
_Avoid_: Processor Utility as an equivalent definition

**Current CPU frequency**:
The mean observed frequency across all logical processors at collection time.
_Avoid_: Nominal frequency as a synonym

**Maximum nominal CPU frequency**:
The highest nominal processor frequency reported by Windows across CPU packages.
It is distinct from advertised turbo frequency and the highest observed frequency.

**CPU package temperature**:
The temperature reported for the processor package as a whole, distinct from
individual core temperatures and motherboard sensors.

**Physical cores / logical processors**:
Physical execution cores and the processor contexts Windows can schedule,
respectively. P / L denotes these counts, not performance/efficiency core types.

**Total physical memory**:
Physical RAM usable by Windows, distinct from the amount installed in the machine
and from the amount currently available.
_Avoid_: Total available memory

**Available physical memory**:
Physical RAM Windows can make available to applications and the system, including
reclaimable memory; it is not limited to completely free RAM.
_Avoid_: Free memory as a synonym

**Memory utilization**:
The percentage of total usable physical RAM counted as in use.
_Avoid_: Swap utilization as a synonym

**Physical memory in use**:
Usable physical RAM occupied after available memory and modified pages are
excluded, following the Windows Task Manager composition targeted by Strata.
_Avoid_: Total minus available as an equivalent definition

**Cached memory**:
Physical RAM on the standby and modified lists. Cached memory overlaps with
other memory categories and must not be added to available memory as a separate
partition of total RAM.
_Avoid_: System cache working set as a synonym

**Committed memory**:
Memory for which Windows has committed backing in physical RAM or paging files.
It is distinct from physical RAM in use and from paging-file usage.
_Avoid_: Swap used as a synonym

**Paging-file usage**:
The aggregate space currently used in Windows paging files. It is distinct from
committed memory and from physical RAM in use.
_Avoid_: Swap used, committed memory as synonyms
