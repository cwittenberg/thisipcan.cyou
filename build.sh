#!/bin/bash
# build.sh - Packages the Show External IP GNOME Extension

EXTENSION_UUID="external-ip-extension@ipcan.cyou"
OUTPUT_ZIP="${EXTENSION_UUID}.shell-extension.zip"

echo "Building GNOME Extension: $EXTENSION_UUID"

# Ensure all necessary folders exist before packing
mkdir -p img flags maps

# Use the official gnome-extensions tool to package the extension
# We explicitly point to the current directory (.) as the source
gnome-extensions pack . \
  --force \
  --extra-source="img" \
  --extra-source="flags" \
  --extra-source="maps" \
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
    echo "Build failed. Ensure you have gnome-extensions installed and check for typos in metadata.json."
    exit 1
fi