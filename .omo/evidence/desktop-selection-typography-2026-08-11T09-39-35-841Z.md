# Packaged Electron sidebar selection/view typography verification

- status: **PASS**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe
- shots: C:\Ai\ChisaCode\.omo\evidence\selection-typography-shots

## Gates

- PASS daemon-online: 127.0.0.1:6767
- PASS seed-agents: e0c76c09-7ab2-47d4-a8ac-5ef651737859, 96875400-e963-42ae-8348-a327601d887a
- PASS s1-home-metrics: n=3
- PASS s2-selected-metrics: n=3
- PASS by-project-siblings-stable-on-select: no metric drift
- PASS s3-by-status-metrics: n=6
- PASS s4-home-by-status-metrics: n=6
- PASS s5-by-status-selected-metrics: n=6
- PASS by-status-siblings-stable-on-select: no metric drift
- PASS by-status-title-calibrated: status 13px/500 (spec 13px/500)
- PASS by-status-project-name-calibrated: project 12.5px/500 (spec 12.5px/500)
- PASS by-project-title-width-stable-home-vs-selected: home 193.33 -> selected 193.33 weight 400->400 size 12.5px->12.5px opacity 1->1

## State samples

### s1 home by-project

```json
[
  {
    "text": "typography-y1XjMS",
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
    "text": "typography-y1XjMS",
    "width": 174.83,
    "height": 16,
    "fontWeight": "500",
    "fontSize": "12.5px",
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
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
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
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
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
    "color": "rgb(111, 118, 134)",
    "opacity": "1",
    "top": 285.67,
    "left": 18.67
  },
  {
    "text": "typography-y1XjMS",
    "width": 174.83,
    "height": 16,
    "fontWeight": "500",
    "fontSize": "12.5px",
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
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
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
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
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
    "color": "rgb(111, 118, 134)",
    "opacity": "1",
    "top": 363.67,
    "left": 18.67
  }
]
```
