# Packaged Electron selected-row hover stability

- status: **PASS**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe

## Gates

- PASS seed-agents: cdc8a980-7814-454b-94bf-ceb88a8c9183, 9cdcc57e-7c64-4df6-acb6-ee5bfc8c2855
- PASS by-project-selected-baseline: {"backgroundColor":"rgba(0, 0, 0, 0)","opacity":"1","boxShadow":"none"}
- PASS by-project-selected-hover-bg-stable: rest rgba(0, 0, 0, 0)/1 -> hover rgba(0, 0, 0, 0)/1
- PASS by-project-unselected-hover-changes-or-stays: rest rgba(0, 0, 0, 0) -> hover rgba(0, 0, 0, 0)
- PASS by-status-selected-baseline: {"backgroundColor":"rgb(255, 255, 255)","opacity":"0.72","boxShadow":"none"}
- PASS by-status-selected-hover-bg-stable: rest rgb(255, 255, 255)/0.72 -> hover rgb(255, 255, 255)/0.72
- PASS by-status-unselected-hover-changes-or-stays: rest rgba(0, 0, 0, 0) -> hover rgb(232, 234, 239)
- PASS by-status-no-inline-hover-actions: settle=0 snooze=0 (must be 0)

## Crash log

- (none)
