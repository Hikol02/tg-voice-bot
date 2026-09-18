import re
with open("src/data/codeTemplates.ts", "r") as f:
    content = f.read()

# Make sure push_to_github.sh template matches our updated script
with open("userbot/push_to_github.sh", "r") as f:
    real_script = f.read()

escaped_script = real_script.replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')
pattern = r"(name:\s*'push_to_github\.sh',[\s\S]*?content:\s*`)([\s\S]*?)(`,\s*\},)"
content = re.sub(pattern, r"\g<1>" + escaped_script + r"\g<3>", content)

with open("src/data/codeTemplates.ts", "w") as f:
    f.write(content)
