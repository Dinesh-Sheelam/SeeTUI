"""dmgbuild settings for SeeTUI.

Paths come from the environment because dmgbuild execs this file without __file__.
"""

from __future__ import annotations

import os

APP = os.environ["SEETUI_APP"]
VOLUME = os.environ.get("SEETUI_VOLUME", "SeeTUI")
ICON = os.environ.get("SEETUI_ICON", "")

files = [APP]
symlinks = {"Applications": "/Applications"}
if ICON:
    badge_icon = ICON
icon_locations = {
    "SeeTUI.app": (140, 120),
    "Applications": (400, 120),
}
window_rect = ((200, 180), (540, 360))
background = "builtin-arrow"
default_view = "icon-view"
show_icon_preview = False
include_icon_view_settings = True
show_statusbar = False
show_tabview = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
sidebar_width = 180
volume_name = VOLUME
format = "UDZO"
size = None
filesystem = "HFS+"
