# Packaged Electron conversation-switch width + AI prose verification

- status: **FAIL**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe
- shots: C:\Ai\ChisaCode\.omo\evidence\conversation-switch-width-shots
- baseline: {"width":750,"x":355,"y":49,"height":750}

## Gates

- PASS daemon-online: 127.0.0.1:6767
- PASS seed-agents: 08d5566a-3110-4f39-a0c9-2dbe75a26262, f251ce57-9e79-44fb-b352-5015964fa355
- PASS seed-message-accepted: {"pendingRun":true}
- PASS baseline-column-present: {"width":750,"x":355,"y":49,"height":750}
- PASS baseline-column-finite: width=750
- PASS switch-a-to-b-width-stable: Δw=0.000 Δx=0.000 last={"width":750,"x":355,"y":49,"height":750}
- PASS switch-b-to-a-width-stable: Δw=0.000 Δx=0.000 last={"width":750,"x":355,"y":49,"height":750}
- PASS assistant-prose-present: {"fontSize":"18px","lineHeight":"23px","color":"rgb(20, 23, 31)","opacity":"1","textPreview":"Cycle 1","sampleCount":8,"fontSizeHistogram":"6x16px|normal|rgb(0, 0, 0) ; 1x14px|normal|rgb(0, 0, 0) ; 1x18px|23px|rgb(20, 23, 31)"}
- FAIL assistant-prose-t3-aligned: fontSize=18px lineHeight=23px color=rgb(20, 23, 31) alpha=1 opacity=1 preview=Cycle 1 n=8 hist=6x16px|normal|rgb(0, 0, 0) ; 1x14px|normal|rgb(0, 0, 0) ; 1x18px|23px|rgb(20, 23, 31)

## Crash log

- (none)
