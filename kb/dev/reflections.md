# 反思日志

## 2026-08-24 — ref #1 MinerU 选文件按钮在 DSH server 无 DISPLAY 时不生效

**What was done**: Fixed dsh-mineru host `pickPath` to read desktop session env via `systemctl --user show-environment` and overlay it on the zenity spawn env; also added a friendly error when no graphical display is available. After review, added a 3s probe timeout, skipped empty desktop env values, and narrowed the code-1 display-failure regex.

**User corrections** (if any):
- 用户说「但是我是在使用桌面环境啊？」——纠正了“server 无 DISPLAY 就无桌面”的初步判断，促使检查 `systemctl --user show-environment` 并采纳读取桌面 env 的方案。
- 用户通过 `ask_user_question` 选定「按此方案修（推荐）」。

**What went wrong**:
- 最初只检查 `/proc/<pid>/environ` 就得出结论，未先验证桌面环境是否实际存在；用户纠正后才发现 `systemctl --user show-environment` 可读到 `DISPLAY=:1` 等变量。
- 第一轮提交后五视角审查发现 `Gtk-WARNING` 正则过宽、`systemctl` 无超时、空 env 覆盖风险；追加 `e65e855` 修复。
- `reflect-audit.sh` 传带 `session-` 前缀的 DSH_SESSION_ID 时找不到 trace，需传裸 UUID；这是工具脚本的命令行约定问题。

**Lessons learned**:
1. 排查无 DISPLAY 类问题时，要同时看 `/proc/<pid>/environ` 和 `systemctl --user show-environment`，不能只看进程 env 就断定“无桌面”。
2. 新增 spawn/子进程逻辑要加超时，并避免过宽的 stderr 正则；zenity code 1 不总是用户取消。
3. 使用 reflect-audit 时传不带 `session-` 前缀的 UUID，或修正脚本兼容全 ID。

**Process improvements**: None（本次无机制固化；后续如需可把“先查 systemctl --user”写成排查 checklist）
