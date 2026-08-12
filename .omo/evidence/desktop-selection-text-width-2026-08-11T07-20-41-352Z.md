# Packaged Electron sidebar selection text-width verification

- status: **PASS**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe
- shots: C:\Ai\ChisaCode\.omo\evidence\selection-text-width-shots
- before metrics: 3
- after metrics: 3

## Gates

- PASS daemon-online: 127.0.0.1:6767
- PASS seed-agents: 22d77bfc-945d-4a18-b91f-52c5f65f6b7e, d44a74b0-bcf9-436a-9805-ef774ba39e56
- PASS workspace-panel-visible
- PASS both-threads-visible
- PASS before-metrics-collected: n=3
- PASS after-metrics-collected: n=3
- PASS sibling-text-metrics-stable: no metric drift
- PASS unselected-agent-a-title-width-stable: 193.33->193.33 weight 400->400 size 12.5px->12.5px color rgb(20, 23, 31)->rgb(20, 23, 31) opacity 1->1
- PASS project-label-width-stable: selection-width-SJ0YsA 201.33->201.33 weight 500->500

## Diffs (sibling labels)

- (none)

## Before sample

```json
[
  {
    "text": "selection-width-SJ0YsA",
    "width": 201.33,
    "height": 16,
    "fontWeight": "500",
    "fontSize": "12.5px",
    "color": "rgb(111, 118, 134)",
    "opacity": "1",
    "top": 240.67,
    "left": 40.67
  },
  {
    "text": "Selection width probe B",
    "width": 193.33,
    "height": 18,
    "fontWeight": "400",
    "fontSize": "12.5px",
    "color": "rgb(20, 23, 31)",
    "opacity": "1",
    "top": 274.67,
    "left": 48.67
  },
  {
    "text": "Selection width probe A",
    "width": 193.33,
    "height": 18,
    "fontWeight": "400",
    "fontSize": "12.5px",
    "color": "rgb(20, 23, 31)",
    "opacity": "1",
    "top": 308.67,
    "left": 48.67
  }
]
```

## After sample

```json
[
  {
    "text": "selection-width-SJ0YsA",
    "width": 201.33,
    "height": 16,
    "fontWeight": "500",
    "fontSize": "12.5px",
    "color": "rgb(111, 118, 134)",
    "opacity": "1",
    "top": 240.67,
    "left": 40.67
  },
  {
    "text": "Selection width probe B",
    "width": 193.33,
    "height": 18,
    "fontWeight": "400",
    "fontSize": "12.5px",
    "color": "rgb(20, 23, 31)",
    "opacity": "1",
    "top": 274.67,
    "left": 48.67
  },
  {
    "text": "Selection width probe A",
    "width": 193.33,
    "height": 18,
    "fontWeight": "400",
    "fontSize": "12.5px",
    "color": "rgb(20, 23, 31)",
    "opacity": "1",
    "top": 308.67,
    "left": 48.67
  }
]
```
