# 智能算法学习助手 V2

[English](README.en.md)

面向所有算法学习者的本地优先桌面工作台。用户可以从空白工作区开始建立自己的模板、题目、关联关系和多供应商 AI 配置。

## 当前状态

V2 [`0.1.3 RC5 Preview`](https://github.com/Fingxing2025/algorithm-learning-workbench/releases/tag/v0.1.3-rc.5) 已公开发布。这是未签名预发布版本，不是稳定版：macOS 仅支持 Apple Silicon（arm64，macOS 12+），Windows 提供 x64 预览安装器；请仅从 Release 页面下载并先校验 `SHA256SUMS.txt`。

本次包含从当前工作区选择模板并导出 `.tex`、紧凑目录/高亮 PDF 和可选 `.doc` 的完整桌面流程；PDF 优先使用 Electron 内置打印引擎，不要求本机安装 TeX，`.doc` 是 RTF 兼容容器。AI 管理还会审计“字符串 / 字符串算法”等语义重复分类，生成可预览、确认和回滚的整理计划。模板元数据则收敛为解决的问题、时间/空间复杂度、标签和用户笔记；“解决的问题”统一描述问题、输入与输出。

当前包未使用 macOS Developer ID/notarization 或 Windows Authenticode 签名；没有自动更新。详见 [发布说明](docs/RELEASE.md) 和 [用户指南](docs/USER_GUIDE.md)。

### macOS 一键安装（Apple Silicon）

完整复制并执行以下命令（不要附带 README 的 Markdown 链接符号）。它会自动断点续传、校验固定 RC5 DMG 的 SHA-256、安装到 `~/Applications`、仅在校验成功后移除该 App 的隔离标记并启动。已有同名 App 时会停止，不会覆盖。

```bash
bash <<'INSTALL'
set -eu

release_tag='v0.1.3-rc.5'
dmg_name='algorithm-learning-workbench-0.1.3-mac-arm64.dmg'
dmg_url="https://github.com/Fingxing2025/algorithm-learning-workbench/releases/download/${release_tag}/${dmg_name}"
expected_dmg_sha256='adf9c9ec37305c857259c299b7eff34750302cf681053680fbf57abfadf85196'
install_dir="${ALGORITHM_WORKBENCH_INSTALL_DIR:-$HOME/Applications}"
work_dir=''
mount_dir=''

fail() { printf '%s\n' "Error: $*" >&2; exit 1; }
cleanup() {
  [ -z "$mount_dir" ] || hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
  [ -z "$work_dir" ] || rm -rf "$work_dir"
}
trap cleanup EXIT HUP INT TERM

[ "$(uname -s)" = 'Darwin' ] || fail 'This installer runs only on macOS.'
if [ "$(uname -m)" != 'arm64' ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" != '1' ]; then
  fail 'This preview supports Apple Silicon Macs only.'
fi

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/algorithm-learning-workbench.XXXXXX")"
dmg_path="$work_dir/$dmg_name"
while ! curl --fail --location --continue-at - --output "$dmg_path" "$dmg_url"; do
  printf '%s\n' 'Download interrupted; retrying from the completed byte range in 2 seconds...' >&2
  sleep 2
done

actual_dmg_sha256="$(shasum -a 256 "$dmg_path" | awk '{ print $1 }')"
[ "$actual_dmg_sha256" = "$expected_dmg_sha256" ] || fail "DMG SHA-256 mismatch: $actual_dmg_sha256"

mount_dir="$work_dir/mount"
mkdir "$mount_dir"
mkdir -p "$install_dir"
hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$dmg_path" >/dev/null
app_source=''
for app_candidate in "$mount_dir"/*.app; do
  [ -d "$app_candidate" ] && app_source="$app_candidate" && break
done
[ -n "$app_source" ] || fail 'The verified DMG did not contain an application bundle.'

destination="$install_dir/$(basename "$app_source")"
[ ! -e "$destination" ] || fail "Stopped without replacing the existing app: $destination"
ditto "$app_source" "$destination"
hdiutil detach "$mount_dir" -quiet
mount_dir=''
xattr -dr com.apple.quarantine "$destination"
open "$destination"
printf '%s\n' "Installed and verified: $destination"
INSTALL
```

这是未签名、未公证的预览版；SHA-256 校验和移除隔离标记不等于 macOS 正式签名或公证。

## 已确定技术方向

- Electron + React + TypeScript + Vite
- Tailwind CSS + shadcn/ui/Radix UI
- SQLite + Drizzle ORM
- Vitest + React Testing Library + Playwright

## 开发参考

相邻目录 `../智能算法学习助手` 只用于核对旧版功能行为。V2 不提供旧版数据迁移，不依赖旧项目目录或数据格式，也不得覆盖旧版文件与未提交改动。

## 开始开发前

1. 阅读 `AGENTS.md`。
2. 阅读 `docs/V2_PRODUCT_SPEC.md`、`docs/ARCHITECTURE.md`、`docs/IMPLEMENTATION_PLAN.md` 和 `docs/QUALITY_GATES.md`。
3. 阅读 `docs/CODEX_SETUP.md` 了解工作区和 Skill 配置。
4. 涉及权限、数据或 AI 协议时阅读 `docs/decisions/` 中的 ADR。

## 本地开发

要求 Node.js 24。`better-sqlite3` 是原生依赖，首次安装依赖以及升级 Electron 后，需要针对当前 Electron ABI 重建：

```bash
npm install
npm run rebuild:native
npm run dev
npm run check
npm run test:e2e
```

## 发布候选

```bash
npm run release:mac:preview
# 正式命令缺少平台证书/公证凭据时会失败：
npm run release:mac:signed
```

Windows 候选必须在原生 Windows 主机或 runner 生成；CI 构建不等于实机安装验收。工程、数据、AI、文件计划和发布边界记录在 `docs/decisions/` 中的 ADR-0001 至 ADR-0035。威胁模型见 [安全威胁模型](docs/智能算法学习助手-v2-threat-model.md)，审查结论见 [安全最佳实践审查](docs/SECURITY_REVIEW.md)。
