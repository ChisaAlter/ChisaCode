# Packaged Electron sidebar shelf verification

- status: **FAIL**
- exe: C:\Ai\ChisaCode\packages\desktop\release\win-unpacked\ChisaCode.exe
- agentId: 4fc7d2ef-52f9-4bda-a0a2-32ab32358c6a
- shots: C:\Users\48818\AppData\Local\Temp\chisacode-sidebar-shelf-home-ZOfhjV\shots
- daemon: 127.0.0.1:6767 pid=12520

## Gates

- PASS daemon-online: 127.0.0.1:6767
- PASS seed-agent: 4fc7d2ef-52f9-4bda-a0a2-32ab32358c6a
- PASS workspace-panel-visible
- PASS hydration-new-conversation
- PASS sidebar-shell-visible
- PASS view-switcher-visible
- PASS search-input-visible
- PASS by-project-thread-row: 4fc7d2ef-52f9-4bda-a0a2-32ab32358c6a
- PASS context-menu-rename
- PASS context-menu-settle
- PASS context-menu-snooze
- PASS by-status-view-visible
- PASS by-status-thread-row
- PASS search-keeps-matching-row
- FAIL search-hides-non-matching-row

## Summary: pass=14 fail=1
