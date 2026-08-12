# Packaged Electron conversation-switch width + AI prose verification

- status: **PASS**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe
- shots: C:\Ai\ChisaCode\.omo\evidence\conversation-switch-width-shots
- baseline: {"width":751,"x":354.5,"y":48.66666793823242,"height":750.6666870117188}

## Gates

- PASS daemon-online: 127.0.0.1:6767
- PASS seed-agents: c9d01707-f05b-46b4-8f75-447ffd7b288e, 0560a87d-344b-4417-9d64-f298d5a9cb14
- PASS seed-message-accepted: {"pendingRun":true}
- PASS baseline-column-present: {"width":751,"x":354.5,"y":48.66666793823242,"height":750.6666870117188}
- PASS baseline-column-finite: width=751
- PASS switch-a-to-b-width-stable: Δw=0.000 Δx=0.000 last={"width":751,"x":354.5,"y":48.66666793823242,"height":750.6666870117188}
- PASS switch-b-to-a-width-stable: Δw=0.000 Δx=0.000 last={"width":751,"x":354.5,"y":48.66666793823242,"height":750.6666870117188}
- PASS assistant-prose-present: {"fontSize":"14px","lineHeight":"23px","color":"rgba(20, 23, 31, 0.8)","opacity":"1","textPreview":"Cycle 1","sampleCount":8,"fontSizeHistogram":"6x16px|normal|rgb(0, 0, 0) ; 1x14px|normal|rgb(0, 0, 0) ; 1x14px|23px|rgba(20, 23, 31, 0.8)"}
- PASS assistant-prose-t3-aligned: fontSize=14px lineHeight=23px color=rgba(20, 23, 31, 0.8) alpha=0.8 opacity=1 preview=Cycle 1 n=8 hist=6x16px|normal|rgb(0, 0, 0) ; 1x14px|normal|rgb(0, 0, 0) ; 1x14px|23px|rgba(20, 23, 31, 0.8)

## Crash log

- (none)
