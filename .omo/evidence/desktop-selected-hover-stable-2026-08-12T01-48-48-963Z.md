# Packaged Electron selected-row hover stability

- status: **PASS**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe

## Gates

- PASS seed-agents: 0657c5e6-c3ca-43cc-979c-d6cabcaafa72, 121a4b49-1167-4688-b148-bafabe87e35c
- PASS by-project-selected-baseline: {"backgroundColor":"rgba(0, 0, 0, 0)","opacity":"1","boxShadow":"none"}
- PASS by-project-selected-hover-bg-stable: rest rgba(0, 0, 0, 0)/1 -> hover rgba(0, 0, 0, 0)/1
- PASS by-project-unselected-hover-changes-or-stays: rest rgba(0, 0, 0, 0) -> hover rgba(0, 0, 0, 0)
- PASS by-status-selected-baseline: {"backgroundColor":"rgb(255, 255, 255)","opacity":"0.72","boxShadow":"none"}
- PASS by-status-selected-hover-bg-stable: rest rgb(255, 255, 255)/0.72 -> hover rgb(255, 255, 255)/0.72
- PASS by-status-unselected-hover-changes-or-stays: rest rgba(0, 0, 0, 0) -> hover rgb(232, 234, 239)
- PASS by-status-hover-settle-visible: settle=true snooze=true (0657c5e6-c3ca-43cc-979c-d6cabcaafa72)

## Crash log

- (none)
