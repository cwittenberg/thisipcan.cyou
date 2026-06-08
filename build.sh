#!/bin/bash
# build.sh - Packages the Show External IP GNOME Extension

EXTENSION_UUID="external-ip-extension@ipcan.cyou"
OUTPUT_ZIP="${EXTENSION_UUID}.shell-extension.zip"

echo "Building GNOME Extension: $EXTENSION_UUID"

# Ensure schemas folder exists
mkdir -p schemas

echo "[1/3] Compiling GSettings schemas..."
glib-compile-schemas schemas/ || {
    echo "Error: Schema compilation failed."
    exit 1
}

echo "[2/3] Removing previous build artifacts..."
rm -f "$OUTPUT_ZIP"

echo "[3/3] Packaging extension..."
gnome-extensions pack . \
  --force \
  --extra-source="schemas/" \
  --extra-source="history.js" \
  --extra-source="prefs.js" \
  --extra-source="stylesheet.css" \
  --extra-source="README.md" \
  --extra-source="LICENSE"

if [ -f "$OUTPUT_ZIP" ]; then
    echo "=============================================="
    echo " Build Successful! "
    echo " Output file: $OUTPUT_ZIP"
    echo "=============================================="
    echo ""
    echo "To install and test locally, run:"
    echo "gnome-extensions install --force $OUTPUT_ZIP"
    echo "Then log out/in (Wayland) or press Alt+F2 -> type 'r' -> Enter (X11)"
    echo "Finally, enable it:"
    echo "gnome-extensions enable $EXTENSION_UUID"
else
    echo "Build failed. Ensure you have gnome-extensions installed."
    exit 1
fi