# Packaged Electron sidebar selection/view typography verification

- status: **FAIL**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe
- shots: C:\Ai\ChisaCode\.omo\evidence\selection-typography-shots

## Gates

- PASS daemon-online: 127.0.0.1:6767
- PASS seed-agents: 190cac1b-c318-40e4-bec1-ec47df8c3d6d, ae1ce469-69bf-47d4-a436-1d4ef5fbfec2
- PASS s1-home-metrics: n=3
- PASS s2-selected-metrics: n=3
- PASS by-project-siblings-stable-on-select: no metric drift
- PASS s3-by-status-metrics: n=6
- PASS s4-home-by-status-metrics: n=6
- PASS s5-by-status-selected-metrics: n=6
- FAIL by-status-siblings-stable-on-select: typography-1z46NR width 174.83->172.83 (Δ2.00) weight 500->500 size 12px->12px color rgb(111, 118, 134)->rgb(111, 118, 134) opacity 1->1 | typography-1z46NR width 174.83->172.83 (Δ2.00) weight 500->500 size 12px->12px color rgb(111, 118, 134)->rgb(111, 118, 134) opacity 1->1
- FAIL by-status-title-matches-by-project: project 12.5px/400/rgb(20, 23, 31) vs status 14px/500/rgb(20, 23, 31)
- PASS by-project-title-width-stable-home-vs-selected: home 193.33 -> selected 193.33 weight 400->400 size 12.5px->12.5px opacity 1->1

## State samples

### s1 home by-project

```json
[
  {
    "text": "typography-1z46NR",
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

### s3 by-status selected A

```json
[
  {
    "text": "typography-1z46NR",
    "width": 172.83,
    "height": 16,
    "fontWeight": "500",
    "fontSize": "12px",
    "color": "rgb(111, 118, 134)",
    "opacity": "1",
    "top": 241.67,
    "left": 36.67
  },
  {
    "text": "Selection width probe B",
    "width": 223.33,
    "height": 18,
    "fontWeight": "500",
    "fontSize": "14px",
    "color": "rgb(20, 23, 31)",
    "opacity": "1",
    "top": 262.67,
    "left": 18.67
  },
  {
    "text": "main",
    "width": 199.33,
    "height": 16,
    "fontWeight": "400",
    "fontSize": "12px",
    "color": "rgb(111, 118, 134)",
    "opacity": "1",
    "top": 285.67,
    "left": 18.67
  },
  {
    "text": "typography-1z46NR",
    "width": 172.83,
    "height": 16,
    "fontWeight": "500",
    "fontSize": "12px",
    "color": "rgb(111, 118, 134)",
    "opacity": "1",
    "top": 319.67,
    "left": 36.67
  },
  {
    "text": "Selection width probe A",
    "width": 223.33,
    "height": 18,
    "fontWeight": "500",
    "fontSize": "14px",
    "color": "rgb(20, 23, 31)",
    "opacity": "1",
    "top": 340.67,
    "left": 18.67
  },
  {
    "text": "main",
    "width": 199.33,
    "height": 16,
    "fontWeight": "400",
    "fontSize": "12px",
    "color": "rgb(111, 118, 134)",
    "opacity": "1",
    "top": 363.67,
    "left": 18.67
  }
]
```
