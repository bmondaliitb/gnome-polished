const GLib = imports.gi.GLib;
for (const file of ARGV) {
    const [, bytes] = GLib.file_get_contents(file);
    const source = new TextDecoder().decode(bytes);
    Reflect.parse(source.replace(/^import .*;\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, ''));
    print(`Syntax OK: ${file}`);
}
