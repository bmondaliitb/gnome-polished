import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

// Mutter normally clips and culls window paints very aggressively. That is
// correct for opaque windows, but a backdrop effect reads pixels beneath the
// window and therefore depends on the whole backing region being current.
//
// Keeping this lightweight effect on the MetaWindowActor tells Mutter's
// MetaCullable pass that the actor has an active effect. Mutter then avoids
// passing a partial redraw clip through this window. The effect itself performs
// no offscreen rendering and simply continues the normal paint chain.
export const BackdropRefreshEffect = GObject.registerClass({
    GTypeName: 'PolishedBackdropRefreshEffect',
}, class BackdropRefreshEffect extends Clutter.Effect {
    vfunc_paint(_node, context, _flags) {
        this.get_actor().continue_paint(context);
    }
});
