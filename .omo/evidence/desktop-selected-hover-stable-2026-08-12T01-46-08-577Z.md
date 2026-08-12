# Packaged Electron selected-row hover stability

- status: **FAIL**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe

## Gates

- PASS seed-agents: 3565065b-42a3-4df2-84cf-ce3f2f3215bd, 50fe5d22-8c57-428c-87ae-098a7fa06124
- PASS by-project-selected-baseline: {"backgroundColor":"rgba(0, 0, 0, 0)","opacity":"1","boxShadow":"none"}
- PASS by-project-selected-hover-bg-stable: rest rgba(0, 0, 0, 0)/1 -> hover rgba(0, 0, 0, 0)/1
- PASS by-project-unselected-hover-changes-or-stays: rest rgba(0, 0, 0, 0) -> hover rgba(0, 0, 0, 0)
- PASS by-status-selected-baseline: {"backgroundColor":"rgb(255, 255, 255)","opacity":"0.72","boxShadow":"none"}
- PASS by-status-selected-hover-bg-stable: rest rgb(255, 255, 255)/0.72 -> hover rgb(255, 255, 255)/0.72
- PASS by-status-unselected-hover-changes-or-stays: rest rgba(0, 0, 0, 0) -> hover rgb(232, 234, 239)
- FAIL by-status-hover-settle-visible: settle-3565065b-42a3-4df2-84cf-ce3f2f3215bd

## Crash log

- (none)
