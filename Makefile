UUID = polished@local
.PHONY: check package
check:
	glib-compile-schemas --strict --dry-run $(UUID)/schemas
	gjs tools/check-syntax.js $(UUID)/extension.js $(UUID)/prefs.js $(UUID)/materials.js $(UUID)/shellSurfaces.js $(UUID)/gtkMenus.js $(UUID)/frostEffect.js $(UUID)/frostShader.js $(UUID)/backdrop.js $(UUID)/backdropRefreshEffect.js $(UUID)/windowSurface.js $(UUID)/frostGeometry.js $(UUID)/frostBlur.js
	gjs tools/check-syntax.js $(UUID)/polish.js
	gjs -m tests/polish.js
	gjs -m tests/materials.js
	gjs -m tests/lifecycle.js
	gjs -m tests/shell-surfaces.js
	gjs -m tests/gtk-menus.js
	gjs -m tests/frost.js
	gjs -m tests/input.js
	gjs -m tests/redraw-guard.js
	gjs tools/check-syntax.js $(UUID)/redrawGuard.js
	gjs tools/check-syntax.js $(UUID)/experience.js
	gjs tools/check-syntax.js $(UUID)/overviewMaterial.js
	gjs tools/check-syntax.js $(UUID)/lockMaterial.js
	gjs tools/check-syntax.js $(UUID)/simpleProfile.js
	gjs -m tests/experience.js
	gjs -m tests/overview.js
	gjs -m tests/lock.js
	gjs -m tests/simple-profile.js
	/usr/bin/python3 tests/gtk-menu-css.py
	/usr/bin/python3 tests/cleanup.py
package: check
	glib-compile-schemas --strict $(UUID)/schemas
	mkdir -p dist
	/usr/bin/python3 -c "from pathlib import Path; Path('dist/.polished-package.zip').unlink(missing_ok=True)"
	cd $(UUID) && zip -qr ../dist/.polished-package.zip metadata.json stylesheet.css extension.js prefs.js materials.js shellSurfaces.js gtkMenus.js frostEffect.js frostShader.js backdrop.js backdropRefreshEffect.js redrawGuard.js windowSurface.js frostGeometry.js frostBlur.js experience.js overviewMaterial.js lockMaterial.js simpleProfile.js polish.js schemas
	mv dist/.polished-package.zip dist/$(UUID).shell-extension.zip

.PHONY: check-frost-gpu
check-frost-gpu:
	gjs -m tests/frost.js
	gjs -m tests/simple-profile.js
	python3 tests/frost-gpu.py

.PHONY: check-runtime-api
check-runtime-api:
	GI_TYPELIB_PATH=/usr/lib/gnome-shell:/usr/lib/x86_64-linux-gnu/mutter-18 LD_LIBRARY_PATH=/usr/lib/gnome-shell:/usr/lib/x86_64-linux-gnu/mutter-18 gjs -m tests/runtime-api.js
