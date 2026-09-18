import re

with open("userbot/install.sh", "r") as f:
    real_script = f.read()

# Escape backticks and standard variables we want to keep literal in JS,
# but allow interpolation if needed. Actually we can just escape `$` -> `\$` for bash vars,
# EXCEPT we want ${cfg.quoteHeader} or similar if they existed. But wait, install.sh doesn't use ${cfg.quoteHeader}.
# We can just escape backticks and $ for template literal, then unescape \$INSTALL_DIR etc if needed?
# Better: Just replace the content block directly.

escaped_script = real_script.replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')

# Let's find the install.sh block in codeTemplates.ts
with open("src/data/codeTemplates.ts", "r") as f:
    ts_content = f.read()

pattern = r"(name:\s*'install\.sh',[\s\S]*?content:\s*`)([\s\S]*?)(`,\s*\},)"
ts_content = re.sub(pattern, r"\g<1>" + escaped_script + r"\g<3>", ts_content)

with open("src/data/codeTemplates.ts", "w") as f:
    f.write(ts_content)

print("Template updated")
