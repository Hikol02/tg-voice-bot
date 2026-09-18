import re
with open("src/data/codeTemplates.ts", "r") as f:
    content = f.read()

# Fallback: Just manually update the install.sh template if string replace failed
with open("userbot/install.sh", "r") as f:
    real_script = f.read()

escaped_script = real_script.replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')
pattern = r"(name:\s*'install\.sh',[\s\S]*?content:\s*`)([\s\S]*?)(`,\s*\},)"
content = re.sub(pattern, r"\g<1>" + escaped_script + r"\g<3>", content)

with open("src/data/codeTemplates.ts", "w") as f:
    f.write(content)
