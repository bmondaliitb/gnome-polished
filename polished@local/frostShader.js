// Independent shader text allows offline compiler/pixel tests without a Shell session.
export const FROST_DECLARATIONS = `
uniform float polishedActive;
uniform vec2 polishedSize;
uniform vec2 polishedTexSize;
uniform vec2 polishedPadding;
uniform vec4 polishedRadii;
uniform vec4 polishedBasis;
uniform vec2 polishedOrigin;
uniform vec2 polishedBackdropSize;
uniform float polishedOpacity;
uniform float polishedBrightness;
uniform vec4 polishedVeil;
uniform float polishedNativeShape;
uniform float polishedNativeTintOpacity;
`;
export const FROST_CODE = `
if (polishedActive > 0.5) {
    vec2 p = cogl_tex_coord0_in.xy * polishedTexSize - polishedPadding;
    vec2 halfSize = polishedSize * 0.5;
    float radius = p.x < halfSize.x
        ? (p.y < halfSize.y ? polishedRadii.x : polishedRadii.w)
        : (p.y < halfSize.y ? polishedRadii.y : polishedRadii.z);
    radius = clamp(radius, 0.0, min(halfSize.x, halfSize.y));
    vec2 q = abs(p - halfSize) - halfSize + vec2(radius);
    float distance = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
    float mask = 1.0 - smoothstep(-0.5, 0.5, distance);
    vec2 local = p / polishedSize;
    vec2 uv = (local.x * polishedBasis.xy + local.y * polishedBasis.zw + polishedOrigin) / polishedBackdropSize;
    // The separable blur has already run on a small texture. Keep foreground
    // and corner coverage at native resolution, with one backdrop lookup.
    vec3 blurred = texture2D(cogl_sampler1, clamp(uv, vec2(0.0), vec2(1.0))).rgb * polishedBrightness;
    blurred = mix(blurred, polishedVeil.rgb, clamp(polishedVeil.a, 0.0, 0.8));
    // Both actor texture and output use premultiplied alpha. Never fade text twice.
    if (polishedNativeShape > 0.5) {
        // Apply frost only where the native client has substantial coverage.
        // Transparent margins remain transparent; faint shadows are preserved.
        // Opaque labels/icons need no backdrop contribution and remain sharp.
        float clientAlpha = cogl_color_out.a / max(polishedOpacity, 0.001);
        float coverage = smoothstep(0.2, 0.75, clientAlpha);
        float translucent = 1.0 - smoothstep(0.96, 0.999, clientAlpha);
        cogl_color_out *= mix(1.0, clamp(polishedNativeTintOpacity, 0.70, 1.0), coverage * translucent);
        cogl_color_out += vec4(blurred, 1.0) * max(0.0, polishedOpacity - cogl_color_out.a) * coverage;
    } else {
        cogl_color_out = (cogl_color_out + vec4(blurred, 1.0) * max(0.0, polishedOpacity - cogl_color_out.a)) * mask;
    }
}
`;
