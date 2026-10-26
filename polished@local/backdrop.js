import GObject from 'gi://GObject';
import St from 'gi://St';

export const VisualBackdrop = GObject.registerClass({GTypeName: 'PolishedVisualBackdrop'},
class VisualBackdrop extends St.Widget {
    // A decorative plane must not enter the pick tree, even in PickMode.ALL.
    // Real surfaces above it keep their own input regions, focus, and event path.
    vfunc_pick(_context) {}
});
