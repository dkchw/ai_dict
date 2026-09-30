#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GRADLE_FILE="app/build.gradle.kts"

# 1. Extract current versions
OLD_VCODE=$(grep -oP 'versionCode\s*=\s*\K\d+' $GRADLE_FILE)
OLD_VNAME=$(grep -oP 'versionName\s*=\s*"\K[^"]+' $GRADLE_FILE)

# 2. Calculate new versions
NEW_VCODE=$((OLD_VCODE + 1))
if [ -n "$1" ]; then
    NEW_VNAME="$1"
else
    MAJOR=$(echo $OLD_VNAME | cut -d. -f1)
    MINOR=$(echo $OLD_VNAME | cut -d. -f2)
    NEW_MINOR=$((MINOR + 1))
    NEW_VNAME="${MAJOR}.${NEW_MINOR}"
fi

echo "====================================="
echo "Bumping version: $OLD_VNAME -> $NEW_VNAME"
echo "====================================="

# 3. Apply to build.gradle.kts
sed -i "s/versionCode = $OLD_VCODE/versionCode = $NEW_VCODE/" $GRADLE_FILE
sed -i "s/versionName = \"$OLD_VNAME\"/versionName = \"$NEW_VNAME\"/" $GRADLE_FILE

# 4. Compile locally
echo "Compiling APK..."
./gradlew assembleDebug

# 5. Copy APK for git tracking
echo "Copying APK to android/ directory..."
cp app/build/outputs/apk/debug/app-debug.apk release_latest.apk

# 6. Commit and Push
echo "Committing and pushing to GitHub..."
git add .
git commit -m "Auto-release v$NEW_VNAME"
git push

# 7. Create GitHub Release
if command -v gh &> /dev/null; then
    echo "Publishing GitHub Release v$NEW_VNAME..."
    gh release create "v$NEW_VNAME" release_latest.apk -t "AI Dict v$NEW_VNAME" --generate-notes || true
fi

echo "====================================="
echo "Done! Published v$NEW_VNAME successfully!"
echo "====================================="
