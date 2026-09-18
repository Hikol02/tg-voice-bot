import os

def patch_file(filepath):
    with open(filepath, "r") as f:
        content = f.read()

    # Add ORIG_DIR
    if 'ORIG_DIR="$PWD"' not in content:
        content = content.replace('INSTALL_DIR="/opt/tg_voice_userbot"', 'ORIG_DIR="$PWD"\nINSTALL_DIR="/opt/tg_voice_userbot"')

    # Replace copy block
    old_block = """# Copy source python files if present in current dir, or write them
if [ -f "userbot.py" ] && [ "$PWD" != "$INSTALL_DIR" ]; then
    cp -f config.py proxy_resolver.py userbot.py "$INSTALL_DIR/"
fi"""

    new_block = """# Copy source python files
if [ -f "$ORIG_DIR/userbot.py" ]; then
    cp -f "$ORIG_DIR/config.py" "$ORIG_DIR/proxy_resolver.py" "$ORIG_DIR/userbot.py" "$INSTALL_DIR/"
else
    echo "[ERROR] userbot.py not found in $ORIG_DIR!"
    echo "Please make sure you are running install.sh from the repository folder."
    exit 1
fi"""
    content = content.replace(old_block, new_block)

    with open(filepath, "w") as f:
        f.write(content)

patch_file("userbot/install.sh")
patch_file("src/data/codeTemplates.ts")
print("Patched successfully")
