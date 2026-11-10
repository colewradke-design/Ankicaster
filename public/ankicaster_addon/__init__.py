"""
Ankicaster Anki Add-on Entry Point
Loads the read-only Ankicaster integration.
"""

from . import ankicaster_addon

def init():
    ankicaster_addon.init_addon()

init()
