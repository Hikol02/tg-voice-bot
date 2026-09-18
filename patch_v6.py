with open("userbot/install.sh", "r") as f:
    content = f.read()

# Fix the ORIG_DIR path check since userbot.py is inside the userbot/ folder of the repo,
# not at the root of the repo (where you run the install script from).

old_check = """# Copy source python files
if [ -f "$ORIG_DIR/userbot.py" ]; then
    cp -f "$ORIG_DIR/config.py" "$ORIG_DIR/proxy_resolver.py" "$ORIG_DIR/userbot.py" "$INSTALL_DIR/"
else
    echo "[ERROR] userbot.py not found in $ORIG_DIR!"
    echo "Please make sure you are running install.sh from the repository folder."
    exit 1
fi"""

new_check = """# Copy source python files
if [ -f "$ORIG_DIR/userbot/userbot.py" ]; then
    cp -f "$ORIG_DIR/userbot/config.py" "$ORIG_DIR/userbot/proxy_resolver.py" "$ORIG_DIR/userbot/userbot.py" "$INSTALL_DIR/"
elif [ -f "$ORIG_DIR/userbot.py" ]; then
    cp -f "$ORIG_DIR/config.py" "$ORIG_DIR/proxy_resolver.py" "$ORIG_DIR/userbot.py" "$INSTALL_DIR/"
else
    echo "[ERROR] userbot.py not found in $ORIG_DIR or $ORIG_DIR/userbot!"
    echo "Please make sure you are running install.sh from the repository folder."
    exit 1
fi"""

content = content.replace(old_check, new_check)

with open("userbot/install.sh", "w") as f:
    f.write(content)

with open("src/data/codeTemplates.ts", "r") as f:
    ts = f.read()
ts = ts.replace(old_check.replace('"', '\\"').replace('$', '\\$'), new_check.replace('"', '\\"').replace('$', '\\$'))
with open("src/data/codeTemplates.ts", "w") as f:
    f.write(ts)

print("Path fixed")
