# Packaged Electron conversation-switch width + AI prose verification

- status: **PASS**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe
- shots: C:\Ai\ChisaCode\.omo\evidence\conversation-switch-width-shots
- baseline: {"width":750,"x":355,"y":49,"height":750}

## Gates

- PASS daemon-online: 127.0.0.1:6767
- PASS seed-agents: 6987947a-d376-4ba8-8f3f-c20f0d0f9a91, 66b1e062-3fcf-4467-9aca-4e21cdc9fb21
- PASS seed-message-accepted: {"pendingRun":true}
- PASS baseline-column-present: {"width":750,"x":355,"y":49,"height":750}
- PASS baseline-column-finite: width=750
- PASS switch-a-to-b-width-stable: Δw=0.000 Δx=0.000 last={"width":750,"x":355,"y":49,"height":750}
- PASS switch-b-to-a-width-stable: Δw=0.000 Δx=0.000 last={"width":750,"x":355,"y":49,"height":750}
- PASS assistant-prose-present: {"fontSize":"14px","lineHeight":"23px","color":"rgba(20, 23, 31, 0.8)","opacity":"1","textPreview":"Cycle 1","sampleCount":8,"fontSizeHistogram":"6x16px|normal|rgb(0, 0, 0) ; 1x14px|normal|rgb(0, 0, 0) ; 1x14px|23px|rgba(20, 23, 31, 0.8)"}
- PASS assistant-prose-t3-aligned: fontSize=14px lineHeight=23px color=rgba(20, 23, 31, 0.8) alpha=0.8 opacity=1 preview=Cycle 1 n=8 hist=6x16px|normal|rgb(0, 0, 0) ; 1x14px|normal|rgb(0, 0, 0) ; 1x14px|23px|rgba(20, 23, 31, 0.8)

## Crash log

- (none)
