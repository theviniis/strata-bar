# Strata

Strata presents desktop resource usage in a per-monitor status bar and widget
popups. Memory terminology follows Windows concepts.

## Language

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
