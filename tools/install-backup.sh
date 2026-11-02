#!/bin/bash
# Richtet die stündliche Sicherung ein (läuft, solange der Mac an ist).
# Ausführen: bash tools/install-backup.sh   (aus dem Ordner app/)
# Fragt einmal nach dem Supabase-Schlüssel und legt ihn nur im macOS-Schlüsselbund ab.
set -e
APP="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(dirname "$APP")/Backup"
NODE="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/de.fitness.backup.plist"

mkdir -p "$OUT"
security add-generic-password -U -a fitness -s fitness-supabase-url -w "https://jbufiwihwwobbvbzldeg.supabase.co"
if ! security find-generic-password -s fitness-supabase-backup-key >/dev/null 2>&1; then
  echo "Supabase-Schlüssel 'service_role' einfügen (Dashboard → Project Settings → API Keys → Legacy), dann Enter:"
  security add-generic-password -U -a fitness -s fitness-supabase-backup-key -w
fi

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>de.fitness.backup</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string>
    <string>$APP/tools/backup.mjs</string>
    <string>$OUT</string>
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/fitness-backup.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/fitness-backup.log</string>
</dict></plist>
EOF
launchctl bootout "gui/$(id -u)/de.fitness.backup" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 5
tail -n 3 "$HOME/Library/Logs/fitness-backup.log"
echo "Fertig. Sicherung liegt in: $OUT"
