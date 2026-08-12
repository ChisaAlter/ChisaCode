# Packaged Electron conversation-switch width + AI prose verification

- status: **FAIL**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe
- shots: C:\Ai\ChisaCode\.omo\evidence\conversation-switch-width-shots
- baseline: {"width":750,"x":355,"y":49,"height":750}

## Gates

- PASS daemon-online: 127.0.0.1:6767
- PASS seed-agents: 8082a18f-c6bb-4744-ad00-467428dfdb5f, 764a7be6-3a94-48a3-a4a6-4032cde629ea
- PASS seed-message-accepted: {"pendingRun":true}
- PASS baseline-column-present: {"width":750,"x":355,"y":49,"height":750}
- PASS baseline-column-finite: width=750
- PASS switch-a-to-b-width-stable: Δw=0.000 Δx=0.000 last={"width":750,"x":355,"y":49,"height":750}
- PASS switch-b-to-a-width-stable: Δw=0.000 Δx=0.000 last={"width":750,"x":355,"y":49,"height":750}
- PASS assistant-prose-present: {"fontSize":"16px","lineHeight":"normal","color":"rgb(0, 0, 0)","opacity":"1"}
- FAIL assistant-prose-t3-aligned: fontSize=16px lineHeight=normal color=rgb(0, 0, 0) alpha=1 opacity=1

## Crash log

- (none)
