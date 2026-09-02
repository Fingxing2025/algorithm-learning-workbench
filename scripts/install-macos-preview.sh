#!/bin/sh

# Installs the exact macOS arm64 DMG published with the 0.1.3 RC5 Preview.
# This is for evaluation only: the App is unsigned and not notarized.

set -eu

release_tag='v0.1.3-rc.5'
dmg_name='algorithm-learning-workbench-0.1.3-mac-arm64.dmg'
dmg_url="https://github.com/Fingxing2025/algorithm-learning-workbench/releases/download/${release_tag}/${dmg_name}"
expected_dmg_sha256='adf9c9ec37305c857259c299b7eff34750302cf681053680fbf57abfadf85196'
default_install_dir="$HOME/Applications"
install_dir="${ALGORITHM_WORKBENCH_INSTALL_DIR:-$default_install_dir}"
work_dir=''
mount_dir=''

fail() {
  printf '%s\n' "Error: $*" >&2
  exit 1
}

cleanup() {
  if [ -n "$mount_dir" ] && [ -d "$mount_dir" ]; then
    hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
  fi

  if [ -n "$work_dir" ] && [ -d "$work_dir" ]; then
    rm -rf "$work_dir"
  fi
}

trap cleanup EXIT HUP INT TERM

if [ "$(uname -s)" != 'Darwin' ]; then
  fail 'This installer runs only on macOS.'
fi

machine_architecture="$(uname -m)"
if [ "$machine_architecture" != 'arm64' ]; then
  translated_process="$(sysctl -n sysctl.proc_translated 2>/dev/null || true)"
  if [ "$translated_process" != '1' ]; then
    fail 'This preview supports Apple Silicon Macs only.'
  fi
fi

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/algorithm-learning-workbench.XXXXXX")"
mount_dir="$work_dir/mount"
dmg_path="$work_dir/$dmg_name"

mkdir -p "$install_dir"

printf '%s\n' 'Downloading the official macOS preview...'
while ! curl --fail --location --continue-at - --output "$dmg_path" "$dmg_url"; do
  printf '%s\n' 'Download interrupted; retrying from the completed byte range in 2 seconds...' >&2
  sleep 2
done

actual_dmg_sha256="$(shasum -a 256 "$dmg_path" | awk '{ print $1 }')"
if [ "$actual_dmg_sha256" != "$expected_dmg_sha256" ]; then
  fail "The downloaded DMG did not match the published SHA-256: $actual_dmg_sha256"
fi

mkdir "$mount_dir"
hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$dmg_path" >/dev/null

app_source=''
for app_candidate in "$mount_dir"/*.app; do
  if [ -d "$app_candidate" ]; then
    app_source="$app_candidate"
    break
  fi
done

if [ -z "$app_source" ]; then
  fail 'The verified DMG did not contain an application bundle.'
fi

app_name="$(basename "$app_source")"
destination="$install_dir/$app_name"
if [ -e "$destination" ]; then
  fail "Stopped without replacing the existing app: $destination"
fi

ditto "$app_source" "$destination"
hdiutil detach "$mount_dir" -quiet
mount_dir=''

# The DMG checksum was verified above. This removes only the macOS download
# quarantine flag from this installed preview App; it does not add a signature.
xattr -dr com.apple.quarantine "$destination"

printf '%s\n' "Installed: $destination"
printf '%s\n' "Verified DMG SHA-256: $actual_dmg_sha256"
open "$destination"
