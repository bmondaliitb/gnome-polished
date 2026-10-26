import Graphene from 'gi://Graphene';

// Map actor-local coordinates through the ACTIVE framebuffer matrices. Menus may
// be inside offscreen effects, so the current framebuffer need not be a StageView.
export function framebufferPoint(modelview, projection, viewport, framebufferHeight, x, y) {
    const point = new Graphene.Vec4();
    point.init(x, y, 0, 1);
    const clip = projection.transform_vec4(modelview.transform_vec4(point));
    const w = clip.get_w();
    if (!Number.isFinite(w) || Math.abs(w) < 1e-6) throw new Error('Invalid backdrop projection');
    return [viewport.x + (clip.get_x() / w + 1) * viewport.width / 2,
        framebufferHeight - (viewport.y + (clip.get_y() / w + 1) * viewport.height / 2)];
}

export function framebufferCapture(source, width, height) {
    const modelview = source.get_modelview_matrix();
    const projection = source.get_projection_matrix();
    const viewport = {x: source.get_viewport_x(), y: source.get_viewport_y(),
        width: source.get_viewport_width(), height: source.get_viewport_height()};
    const project = (x, y) => framebufferPoint(modelview, projection, viewport, source.get_height(), x, y);
    const points = [project(0, 0), project(width, 0), project(0, height), project(width, height)];
    const left = Math.floor(Math.min(...points.map(p => p[0])));
    const top = Math.floor(Math.min(...points.map(p => p[1])));
    const right = Math.ceil(Math.max(...points.map(p => p[0])));
    const bottom = Math.ceil(Math.max(...points.map(p => p[1])));
    const x = Math.max(0, left), y = Math.max(0, top);
    const captureWidth = Math.min(source.get_width(), right) - x;
    const captureHeight = Math.min(source.get_height(), bottom) - y;
    if (captureWidth <= 0 || captureHeight <= 0) return null;
    const basis = [points[1][0] - points[0][0], points[1][1] - points[0][1],
        points[2][0] - points[0][0], points[2][1] - points[0][1]];
    const scale = Math.sqrt(Math.abs(basis[0] * basis[3] - basis[1] * basis[2]) / Math.max(1, width * height));
    return {rect: {x, y, width: captureWidth, height: captureHeight}, basis,
        origin: [points[0][0] - x, points[0][1] - y], scale};
}
