with open("userbot/config.py", "r") as f:
    real_cfg = f.read()

escaped = real_cfg.replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')

with open("src/data/codeTemplates.ts", "r") as f:
    ts = f.read()

import re
pattern = r"(name:\s*'config\.py',[\s\S]*?content:\s*`)([\s\S]*?)(`,\s*\},)"
ts = re.sub(pattern, r"\g<1>" + escaped + r"\g<3>", ts)

with open("src/data/codeTemplates.ts", "w") as f:
    f.write(ts)

print("Config template updated")
