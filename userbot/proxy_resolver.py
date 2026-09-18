import re
import subprocess
import logging
from typing import Tuple, Optional

logger = logging.getLogger("ProxyResolver")


def fetch_tg_ws_proxy_credentials(
    service_name: str = "tg-ws-proxy.service",
) -> Tuple[Optional[str], Optional[int], Optional[str]]:
    """
    Auto-fetches tg://proxy?server=...&port=...&secret=... parameters
    from tg-ws-proxy systemd journal.
    """
    service_variants = [service_name]
    if service_name.endswith(".service"):
        service_variants.append(service_name.replace(".service", ""))
    else:
        service_variants.append(f"{service_name}.service")

    commands = []
    for s in service_variants:
        commands.append(["journalctl", "-u", s, "-n", "80", "--no-pager"])
        commands.append(["systemctl", "status", s, "--no-pager"])

    output = ""
    for cmd in commands:
        try:
            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=4,
            )
            if proc.returncode == 0 and proc.stdout:
                if "tg://proxy" in proc.stdout:
                    output = proc.stdout
                    break
                elif not output and len(proc.stdout) > 50:
                    output = proc.stdout
        except (subprocess.SubprocessError, FileNotFoundError, PermissionError) as e:
            logger.debug(f"Command {' '.join(cmd)} failed: {e}")

    if not output:
        logger.warning(
            f"Could not read logs for '{service_name}'. "
            "Ensure tg-ws-proxy service is running and user has access to journalctl."
        )
        return None, None, None

    # Search for: tg://proxy?server=127.0.0.1&port=1443&secret=dd54defaad7b9d6abf694539af11efe10b
    matches = list(re.finditer(
        r"tg://proxy\?server=(?P<server>[^&\s]+)&port=(?P<port>\d+)&secret=(?P<secret>[a-zA-Z0-9]+)",
        output
    ))

    if matches:
        latest = matches[-1]
        server = latest.group("server").strip()
        port = int(latest.group("port").strip())
        secret = latest.group("secret").strip()

        logger.info(
            f"Successfully resolved tg-ws-proxy params: "
            f"host={server}, port={port}, secret={secret[:6]}...{secret[-4:]}"
        )
        return server, port, secret

    return None, None, None
