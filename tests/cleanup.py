"""Ensure the runtime has no removed-feature imports or settings branches."""
from pathlib import Path
import re

root = Path('polished@local')
obsolete = ('sidebar-materials', 'all-applications', 'focused-only', 'force-translucency',
            'window-popups', 'window-dialogs', 'render-quality', 'backdrop-fps',
            'gentle-transitions', 'panel-blur', 'rounded-frost', 'preserve-corners',
            'WindowTracker', 'cancelPendingRefresh', 'renderQuality.js', 'freezeBackdrop',
            'cachedBackdrop', 'backdropFps', 'maxFps')
for folder in (root, Path('tests')):
    for path in folder.glob('*.js'):
        source = path.read_text()
        for relative in re.findall(r"from ['\"]([^'\"]+)['\"]", source):
            if relative.startswith('.'):
                assert (path.parent / relative).is_file(), (path, relative)
        if folder == root:
            for token in obsolete:
                assert token not in source, (path, token)
assert 'timeout_add' not in (root / 'frostEffect.js').read_text(), 'Cached frost must not schedule refresh timers'
print('Removed-feature settings/import audit and cached-only timer check passed')
