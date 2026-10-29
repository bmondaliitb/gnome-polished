"""Rollback checks use temporary installations and mocked desktop settings only."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('undo_all', 'tools/undo-all.py')
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)


class RollbackTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='undo-test-')
        self.root = Path(self.temp.name)
        self.paths = m.SystemPaths(self.root / 'sources', self.root / 'gdm/database',
                                   self.root / 'extensions', self.root / 'state', self.root / 'backups')
        self.paths.sources.mkdir()
        self.paths.database.parent.mkdir()
        self.native = ("[org/gnome/shell]\nenabled-extensions=['ubuntu-dock@ubuntu.com']\n"
                       "[com/ubuntu/login-screen]\nbackground-picture-uri=''\n")
        (self.paths.sources / '00-native').write_text(self.native)
        self.paths.database.write_bytes(b'original compiled database')

    def tearDown(self):
        self.temp.cleanup()

    def install(self, companion):
        dropin, extension, state = m.companion_paths(companion, self.paths)
        contents = (f"[org/gnome/shell]\nenabled-extensions=['{companion.uuid}']\n"
                    f"[com/ubuntu/login-screen]\nbackground-picture-uri='file:///var/lib/{companion.state_name}/wallpaper'\n")
        dropin.write_text(contents)
        for directory in (extension, state):
            directory.mkdir(parents=True)
            (directory / companion.marker).touch()
        (state / 'settings.json').write_text(json.dumps({'backend': 'ubuntu-system-defaults', 'dropin': contents}))
        (state / 'wallpaper').write_bytes(b'project wallpaper')
        (extension / 'metadata.json').write_text(json.dumps({'uuid': companion.uuid, 'session-modes': ['gdm']}))
        (extension / 'extension.js').write_text('// fixture extension')

    def test_both_login_companions_are_archived_and_native_database_compiles(self):
        for companion in m.COMPANIONS:
            self.install(companion)
        with contextlib.redirect_stdout(io.StringIO()):
            backup = m.undo_system(self.paths)
        self.assertEqual((self.paths.sources / '00-native').read_text(), self.native)
        self.assertEqual(m.read_greeter(self.paths.database, 'org.gnome.shell', 'enabled-extensions'),
                         ['ubuntu-dock@ubuntu.com'])
        self.assertEqual((backup / 'greeter-dconf-defaults.before').read_bytes(), b'original compiled database')
        self.assertEqual(len(json.loads((backup / 'manifest.json').read_text())), 6)
        self.assertEqual(len(list(backup.rglob('settings.json'))), 2)
        self.assertFalse(m.installed_companions(self.paths))
        before = self.paths.database.read_bytes()
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertIsNone(m.undo_system(self.paths))
        self.assertEqual(self.paths.database.read_bytes(), before)

    def test_compile_failure_cannot_remove_any_original(self):
        self.install(m.COMPANIONS[0])
        def fail(*_):
            raise RuntimeError('compile failed')
        with self.assertRaisesRegex(RuntimeError, 'compile failed'):
            m.undo_system(self.paths, compile_db=fail)
        self.assertTrue(all(path.exists() for path in m.companion_paths(m.COMPANIONS[0], self.paths)))
        self.assertEqual(self.paths.database.read_bytes(), b'original compiled database')
        self.assertFalse(self.paths.backups.exists())

    def test_external_admin_override_is_detected_before_changes(self):
        self.install(m.COMPANIONS[0])
        (self.paths.sources / 'zzz-admin').write_text("[org/gnome/shell]\nenabled-extensions=['prism-login@local']\n")
        with self.assertRaisesRegex(RuntimeError, 'administrator GDM defaults'):
            m.undo_system(self.paths)
        self.assertTrue(all(path.exists() for path in m.companion_paths(m.COMPANIONS[0], self.paths)))
        self.assertEqual(self.paths.database.read_bytes(), b'original compiled database')

    def test_edited_dropin_and_linked_contents_are_refused(self):
        companion = m.COMPANIONS[0]
        self.install(companion)
        dropin, extension, _ = m.companion_paths(companion, self.paths)
        original = dropin.read_text()
        dropin.write_text(original + '# external modification\n')
        with self.assertRaisesRegex(RuntimeError, 'Edited/legacy'):
            m.undo_system(self.paths)
        dropin.write_text(original)
        (extension / 'link').symlink_to(self.paths.database)
        with self.assertRaisesRegex(RuntimeError, 'Linked installation'):
            m.undo_system(self.paths)
        self.assertEqual(self.paths.database.read_bytes(), b'original compiled database')

    def test_commit_failure_restores_all_moved_installations(self):
        for companion in m.COMPANIONS:
            self.install(companion)
        with patch.object(m.os, 'replace', side_effect=OSError('commit failed')):
            with self.assertRaisesRegex(OSError, 'commit failed'):
                m.undo_system(self.paths)
        for companion in m.COMPANIONS:
            m.validate_companion(companion, self.paths)
        self.assertEqual(self.paths.database.read_bytes(), b'original compiled database')

    def test_gtk_cleanup_preserves_unrelated_rules_and_backs_up_owned_files(self):
        config = self.root / 'config'
        directory = config / 'gtk-4.0'
        directory.mkdir(parents=True)
        original = '/* custom */\nbutton {padding: 3px;}\n'
        source = original + ('/* BEGIN PRISM GTK MENUS */\nlabel {color: white;}\n/* END PRISM GTK MENUS */\n'
                             '/* BEGIN POLISHED GTK MENUS */\nlabel {color: black;}\n/* END POLISHED GTK MENUS */\n')
        (directory / 'gtk.css').write_text(source)
        (directory / 'prism-managed-menus.css').write_text(m.GENERATED['prism-managed-menus.css'] + '\n/* fixture */')
        with contextlib.redirect_stdout(io.StringIO()):
            m.clean_gtk(config, self.root / 'gtk-backup')
        self.assertEqual((directory / 'gtk.css').read_text(), original)
        self.assertEqual((self.root / 'gtk-backup/gtk-4.0/gtk.css').read_text(), source)
        self.assertFalse((directory / 'prism-managed-menus.css').exists())
        self.assertEqual(m.gtk_plan(config), [])

    def test_malformed_css_and_unrecognized_generated_file_are_not_modified(self):
        directory = self.root / 'config/gtk-4.0'
        directory.mkdir(parents=True)
        main = directory / 'gtk.css'
        main.write_text('/* BEGIN PRISM GTK MENUS */\nbutton {}')
        with self.assertRaisesRegex(RuntimeError, 'Incomplete'):
            m.gtk_plan(self.root / 'config')
        main.write_text('button {}')
        (directory / 'polished-managed-menus.css').write_text('/* someone else */')
        with self.assertRaisesRegex(RuntimeError, 'Unrecognized'):
            m.gtk_plan(self.root / 'config')
        self.assertEqual(main.read_text(), 'button {}')
        with self.assertRaisesRegex(RuntimeError, 'Nested'):
            m.clean_menu_css('/* BEGIN PRISM GTK MENUS *//* BEGIN POLISHED GTK MENUS */')

    def test_owned_standalone_import_is_removed_but_other_imports_survive(self):
        directory = self.root / 'config/gtk-4.0'
        directory.mkdir(parents=True)
        (directory / 'prism-managed-menus.css').write_text(m.GENERATED['prism-managed-menus.css'])
        (directory / 'gtk.css').write_text('@import url("prism-managed-menus.css");\n@import "mine.css";\n')
        with contextlib.redirect_stdout(io.StringIO()):
            m.clean_gtk(self.root / 'config', self.root / 'gtk-backup')
        self.assertEqual((directory / 'gtk.css').read_text(), '@import "mine.css";\n')

    def test_user_preview_writes_nothing_and_apply_preserves_other_extensions(self):
        config, data, state = (self.root / name for name in ('config', 'data', 'user-state'))
        directory = config / 'gtk-4.0'
        directory.mkdir(parents=True)
        (directory / 'gtk.css').write_text('/* BEGIN PRISM GTK MENUS */x{}/* END PRISM GTK MENUS */\nbutton{}')
        extension = data / 'gnome-shell/extensions/polished@local'
        extension.mkdir(parents=True)
        (extension / 'metadata.json').write_text(json.dumps({'uuid': 'polished@local'}))
        profile = state / 'polished-minimum/profile.json'
        profile.parent.mkdir(parents=True)
        profile.write_text('{"fixture":true}')
        class Setting:
            def __init__(self):
                self.reset_keys = []
                self.arrays = {'enabled-extensions': ['keep@local', 'polished@local'],
                               'disabled-extensions': ['other@local', 'prism@local']}
            def get_default_value(self, _): return m.GLib.Variant('s', 'native')
            def get_user_value(self, _): return m.GLib.Variant('s', 'custom')
            def get_value(self, _): return m.GLib.Variant('s', 'custom')
            def is_writable(self, _): return True
            def reset(self, key): self.reset_keys.append(key)
            def get_strv(self, key): return self.arrays[key]
            def set_strv(self, key, value): self.arrays[key] = value; return True
        setting = Setting()
        calls = []
        def command(*args, **_):
            calls.append(args)
            if args[:3] == ('/usr/bin/dconf', 'dump', '/'):
                return '[fixture]\nkey=true\n'
            if args == ('gnome-extensions', 'list', '--enabled'):
                return 'polished@local\nkeep@local\n'
            return ''
        env = {'XDG_CONFIG_HOME': str(config), 'XDG_DATA_HOME': str(data),
               'XDG_STATE_HOME': str(state), 'DBUS_SESSION_BUS_ADDRESS': 'test-only'}
        with patch.dict(os.environ, env), patch.object(m.os, 'geteuid', return_value=1000), \
             patch.object(m, 'installed_companions', return_value=[]), \
             patch.object(m, 'appearance_settings', side_effect=lambda: iter([('test.schema', setting, 'theme')])), \
             patch.object(m, 'run', side_effect=command), \
             patch.object(m.Gio.Settings, 'new', return_value=setting), \
             patch.object(m.Gio.Settings, 'sync'), contextlib.redirect_stdout(io.StringIO()):
            m.undo_user()
            self.assertEqual(calls, [])
            self.assertTrue(extension.exists())
            self.assertFalse((state / 'gnome-material-undo').exists())
            m.undo_user(apply=True)
        self.assertFalse(extension.exists())
        self.assertFalse(profile.exists())
        self.assertEqual((directory / 'gtk.css').read_text(), 'button{}')
        self.assertEqual(setting.arrays['enabled-extensions'], ['keep@local'])
        self.assertEqual(setting.arrays['disabled-extensions'], ['other@local'])
        self.assertEqual(setting.reset_keys, ['theme'])
        reset_paths = [args[-1] for args in calls if args[:3] == ('/usr/bin/dconf', 'reset', '-f')]
        self.assertEqual(reset_paths, ['/org/gnome/shell/extensions/' + name + '/' for name in ('polished','prism','polished-minimum')])
        self.assertIn(('gnome-extensions', 'disable', 'polished@local'), calls)
        self.assertTrue(list((state / 'gnome-material-undo').rglob('dconf.ini')))


if __name__ == '__main__':
    unittest.main()
