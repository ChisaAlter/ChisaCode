# Packaged Electron conversation-switch width + AI prose verification

- status: **FAIL**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe
- shots: C:\Ai\ChisaCode\.omo\evidence\conversation-switch-width-shots
- baseline: {"width":750,"x":355,"y":49,"height":750}

## Gates

- PASS daemon-online: 127.0.0.1:6767
- PASS seed-agents: 8c235b36-9b46-4a16-a0bb-df99162e8f1f, 9b0a83e5-99a7-49cc-86e8-08eb69e3c466
- PASS seed-message-accepted: {"pendingRun":true}
- PASS baseline-column-present: {"width":750,"x":355,"y":49,"height":750}
- PASS baseline-column-finite: width=750
- PASS switch-a-to-b-width-stable: Δw=0.000 Δx=0.000 last={"width":750,"x":355,"y":49,"height":750}
- PASS switch-b-to-a-width-stable: Δw=0.000 Δx=0.000 last={"width":750,"x":355,"y":49,"height":750}
- FAIL assistant-prose-present: {"fontSize":"16px","lineHeight":"normal","color":"rgb(0, 0, 0)","opacity":"1","textPreview":"Cycle 1","sampleCount":0,"fontSizeHistogram":""}
- FAIL assistant-prose-t3-aligned: fontSize=16px lineHeight=normal color=rgb(0, 0, 0) alpha=1 opacity=1 preview=Cycle 1 n=0 hist=

## Crash log

- (none)
