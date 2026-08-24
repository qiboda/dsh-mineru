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

## 2026-08-24 — ref #2 MinerU HTML 阅读位置跨 DSH session 共享

**What was done**: Changed MinerU client reading-position persistence from per-DSH-session localStorage keys to global keys (`dsh-mineru-current-doc`, `dsh-mineru-scroll:<id>`). Added an explicit marker-guarded one-time migration (`dsh-mineru-migrate-reading-pos-v1`) from the active session's old per-session keys, normalized migrated scroll values, flushed the current scroll before DSH session switches, and updated README.

**User corrections** (if any): 无。用户需求本身即本次变更目标（“改为所有session共享同一个位置信息”），未出现语义纠正。

**What went wrong**:
- 第一轮用 5 个后台 `subagent_*` 并行审查，等待期间它们持续 `[running]`，未在合理时间内返回；中断后用 `workflow` 重新并行跑同一组审查才拿到完整结果。多代理审查应直接使用会阻塞返回的 `workflow` 工具，避免后台通知等待。
- 两个完整 5 视角审查轮次后仍发现可固化问题（迁移 marker、localStorage 迭代、README 同步），说明初版迁移逻辑不够显式，本可以在一轮 review 内覆盖。
- 工作流输出较长被截断，需要读取 spill 文件才能拿到完整报告。

**Lessons learned**:
1. 需要并行多子代理且必须拿到结果时，优先用 `workflow`（同步等待全部完成），而不是后台 `subagent_*` 后等待通知。
2. 涉及存储格式/迁移语义时，第一版就应包含显式一次性 marker、先快照 localStorage keys 再写入、以及 README 同步；这三项在多视角审查里必然被提出。
3. 大规模工具输出直接落 spill 后再按需读取，避免在上下文中堆积原始 JSON。

**Process improvements**: None（本次未固化新的机制；后续可考虑把“同步 client.js → lib/client.js”做成脚本，减少手工复制两份 bundle 的摩擦）。
