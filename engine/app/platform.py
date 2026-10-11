"""Host operating system checks.

Callers use this module attribute so tests can simulate Windows without
changing ``os.name``. pathlib reads ``os.name`` directly and refuses to build
paths when that value does not match the machine.
"""

from __future__ import annotations

import os


def is_windows() -> bool:
    return os.name == "nt"
