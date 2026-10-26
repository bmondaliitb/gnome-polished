import {eligible, materialStyle, SOFT_TINT, shellSurfaceKind, shellSurfaceRole, surfacePalette} from '../polished@local/materials.js';
function assert(value,message){if(!value)throw new Error(message);}
assert(eligible({normal:true,fullscreen:false,minimized:false}), 'Eligible application types are admitted without an app list');
for(const state of [{normal:false},{fullscreen:true},{minimized:true}])
    assert(!eligible({normal:true,fullscreen:false,minimized:false,...state}), 'Desktop/fullscreen/minimized exclusions remain');
assert(materialStyle(true)!==materialStyle(false), 'Application materials retain light/dark palettes');
assert(materialStyle(true,{emphasis:true,focused:false})!==materialStyle(true,{emphasis:true,focused:true}),
    'Inactive windows retain softer emphasis');
for (const dark of [true, false]) {
    const palette = surfacePalette(dark);
    assert(materialStyle(dark,{emphasis:true,focused:false}).includes(palette.inactiveEdge),
        'Inactive material uses the appearance-specific edge, including light mode');
    assert(parseFloat(palette.activeEdge.split(',').at(-1)) > parseFloat(palette.edge.split(',').at(-1)) &&
        parseFloat(palette.edge.split(',').at(-1)) > parseFloat(palette.inactiveEdge.split(',').at(-1)),
        'Active windows separate more clearly than floating surfaces and inactive windows');
}
assert(SOFT_TINT===0.28 && surfacePalette(true).background==='25,28,35','Shared Soft appearance is unchanged');
for(const [classes,kind] of [['dash-background','dock'],['popup-menu-content','menus'],['quick-settings','menus'],
    ['modal-dialog','dialogs'],['notification-banner','notifications'],['switcher-list','overlays'],['osd-window','overlays']])
    assert(shellSurfaceKind(classes)===kind,'Surface classification remains');
assert(shellSurfaceKind('popup-menu-item')===null && shellSurfaceRole('calendar')==='inset' &&
    shellSurfaceRole('popup-menu-boxpointer')==='pointer','Foreground/inset/BoxPointer roles remain separate');
print('Unified material styling, eligibility and surface-role checks passed');
