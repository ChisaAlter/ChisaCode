# Packaged Electron conversation-switch width + AI prose verification

- status: **PASS**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe
- shots: C:\Ai\ChisaCode\.omo\evidence\conversation-switch-width-shots
- baseline: {"width":751,"x":354.5,"y":48.66666793823242,"height":750.6666870117188}

## Gates

- PASS daemon-online: 127.0.0.1:6767
- PASS seed-agents: 2543d8e9-9905-4cd1-a23e-3e7c6bbfe215, 613870d2-2def-4e7c-9dc7-d46ec312a10c
- PASS seed-message-accepted: {"pendingRun":true}
- PASS baseline-column-present: {"width":751,"x":354.5,"y":48.66666793823242,"height":750.6666870117188}
- PASS baseline-column-finite: width=751
- PASS switch-a-to-b-width-stable: Δw=0.000 Δx=0.000 last={"width":751,"x":354.5,"y":48.66666793823242,"height":750.6666870117188}
- PASS switch-b-to-a-width-stable: Δw=0.000 Δx=0.000 last={"width":751,"x":354.5,"y":48.66666793823242,"height":750.6666870117188}
- PASS assistant-prose-present: {"leafCount":1,"alignedCount":1,"misaligned":[],"textPreview":"Cycle 1","fontSizeHistogram":"1x14px|23px|rgba(20, 23, 31, 0.8)"}
- PASS assistant-prose-t3-aligned: leaves=1 aligned=1 misaligned=[] hist=1x14px|23px|rgba(20, 23, 31, 0.8) preview=Cycle 1

## Crash log

- (none)
