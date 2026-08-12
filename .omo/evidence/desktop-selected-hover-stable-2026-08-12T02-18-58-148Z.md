# Packaged Electron selected-row hover stability

- status: **PASS**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe

## Gates

- PASS seed-agents: 7d4ef62e-707a-48b1-8fa3-fef627f3b8df, dbd902a6-6cfe-4b25-bafc-46c559eb282a
- PASS by-project-selected-baseline: {"backgroundColor":"rgba(0, 0, 0, 0)","opacity":"1","boxShadow":"none"}
- PASS by-project-selected-hover-bg-stable: rest rgba(0, 0, 0, 0)/1 -> hover rgba(0, 0, 0, 0)/1
- PASS by-project-unselected-hover-changes-or-stays: rest rgba(0, 0, 0, 0) -> hover rgba(0, 0, 0, 0)
- PASS by-status-selected-baseline: {"backgroundColor":"rgb(255, 255, 255)","opacity":"0.72","boxShadow":"none"}
- PASS by-status-selected-hover-bg-stable: rest rgb(255, 255, 255)/0.72 -> hover rgb(255, 255, 255)/0.72
- PASS by-status-unselected-hover-changes-or-stays: rest rgba(0, 0, 0, 0) -> hover rgb(232, 234, 239)

## Crash log

- (none)
