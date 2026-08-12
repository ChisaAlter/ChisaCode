# Packaged Electron sidebar selection/view typography verification

- status: **FAIL**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe
- shots: C:\Ai\ChisaCode\.omo\evidence\selection-typography-shots

## Gates

- PASS daemon-online: 127.0.0.1:6767
- PASS seed-agents: ee564c00-5901-4336-9aed-38618a6ddfe0, bb3c81d0-bf63-47dd-937a-7b48cc8b6daf
- PASS s1-home-metrics: n=3
- PASS s2-selected-metrics: n=3
- FAIL by-project-siblings-stable-on-select: typography-RlnBPb width 201.33->201.33 (Δ0.00) weight 500->500 size 12.5px->12.5px family -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif->system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif color rgb(111, 118, 134)->rgb(111, 118, 134) opacity 1->1 | Selection width probe B width 193.33->193.33 (Δ0.00) weight 400->400 size 12.5px->12.5px family -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif->system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif color rgb(20, 23, 31)->rgb(20, 23, 31) opacity 1->1
- PASS s3-by-status-metrics: n=6
- PASS s4-home-by-status-metrics: n=6
- PASS s5-by-status-selected-metrics: n=6
- FAIL by-status-siblings-stable-on-select: typography-RlnBPb width 174.83->172.83 (Δ2.00) weight 500->500 size 12.5px->12.5px family -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif->system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif color rgb(111, 118, 134)->rgb(111, 118, 134) opacity 1->1 | main width 199.33->199.33 (Δ0.00) weight 400->400 size 12px->12px family -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif->system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif color rgb(111, 118, 134)->rgb(111, 118, 134) opacity 1->1 | typography-RlnBPb width 174.83->172.83 (Δ2.00) weight 500->500 size 12.5px->12.5px family -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif->system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif color rgb(111, 118, 134)->rgb(111, 118, 134) opacity 1->1 | Selection width probe A width 223.33->223.33 (Δ0.00) weight 500->500 size 13px->13px family -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif->system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif color rgb(20, 23, 31)->rgb(20, 23, 31) opacity 1->1 | main width 199.33->199.33 (Δ0.00) weight 400->400 size 12px->12px family -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif->system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif color rgb(111, 118, 134)->rgb(111, 118, 134) opacity 1->1
- PASS by-status-title-calibrated: status 13px/500 (spec 13px/500)
- PASS by-status-project-name-calibrated: project 12.5px/500 (spec 12.5px/500)
- PASS by-project-title-width-stable-home-vs-selected: home 193.33 -> selected 193.33 weight 400->400 size 12.5px->12.5px opacity 1->1

## State samples

### s1 home by-project

```json
[
  {
    "text": "typography-RlnBPb",
    "width": 201.33,
    "height": 16,
    "fontWeight": "500",
    "fontSize": "12.5px",
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
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
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
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
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
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
    "text": "typography-RlnBPb",
    "width": 172.83,
    "height": 16,
    "fontWeight": "500",
    "fontSize": "12.5px",
    "fontFamily": "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
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
    "fontSize": "13px",
    "fontFamily": "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
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
    "fontFamily": "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
    "color": "rgb(111, 118, 134)",
    "opacity": "1",
    "top": 285.67,
    "left": 18.67
  },
  {
    "text": "typography-RlnBPb",
    "width": 172.83,
    "height": 16,
    "fontWeight": "500",
    "fontSize": "12.5px",
    "fontFamily": "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
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
    "fontSize": "13px",
    "fontFamily": "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
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
    "fontFamily": "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
    "color": "rgb(111, 118, 134)",
    "opacity": "1",
    "top": 363.67,
    "left": 18.67
  }
]
```
