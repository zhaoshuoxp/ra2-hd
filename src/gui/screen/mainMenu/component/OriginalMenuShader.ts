export const menuFootageVertex = `attribute vec2 position; varying vec2 uv;
void main() { uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }`;
export const menuFootageFragment = `precision highp float;
uniform sampler2D movie; uniform sampler2D reference; uniform sampler2D cleanMask;
uniform float movieTime; uniform float cycleDuration; varying vec2 uv;
vec3 movieSample(vec2 p) {
    return mix(texture2D(reference, p).rgb, texture2D(movie, p).rgb, texture2D(cleanMask, p).r);
}
vec3 filteredMovie(vec2 p) {
    vec2 d = vec2(1. / 632., 1. / 570.);
    return movieSample(p) * .6 + (movieSample(p + vec2(d.x, 0.)) + movieSample(p - vec2(d.x, 0.)) +
        movieSample(p + vec2(0., d.y)) + movieSample(p - vec2(0., d.y))) * .1;
}
vec3 filtered(sampler2D image, vec2 p) {
    vec2 d = vec2(1. / 632., 1. / 570.);
    return texture2D(image, p).rgb * .6 +
        (texture2D(image, p + vec2(d.x, 0.)).rgb + texture2D(image, p - vec2(d.x, 0.)).rgb +
         texture2D(image, p + vec2(0., d.y)).rgb + texture2D(image, p - vec2(0., d.y)).rgb) * .1;
}
void main() {
    vec2 destination = vec2(uv.x, 1. - uv.y) * vec2(1672., 941.);
    vec2 sourcePixel = (destination - vec2(245., -45.)) / vec2(1.87, 1.94);
    vec2 source = vec2(sourcePixel.x / 632., 1. - sourcePixel.y / 570.);
    vec3 current = filteredMovie(source), background = filtered(reference, source);
    float change = length(current - background);
    float grid = smoothstep(.32, .65, background.r) * (1. - smoothstep(.08, .22, max(background.g, background.b)));
    vec3 repaired = vec3(0.); float total = 0., neighborhood = change;
    for (int i = 0; i < 8; i++) {
        float angle = float(i) * .785398;
        vec2 p = source + vec2(cos(angle) * 4. / 632., sin(angle) * 4. / 570.);
        vec3 neighbor = movieSample(p), backgroundSample = texture2D(reference, p).rgb;
        float weight = 1. - smoothstep(.25, .65, backgroundSample.r);
        repaired += neighbor * weight; total += weight;
        neighborhood = max(neighborhood, length(neighbor - backgroundSample));
    }
    if (total > .1) current = mix(current, repaired / total, grid);
    change = mix(change, neighborhood, grid);
    float alpha = smoothstep(.025, .12, change) * min(1., change * 5.);
    float staticMark = smoothstep(.15, .4, max(background.g, background.b));
    alpha *= 1. - staticMark * (1. - smoothstep(.04, .12, length(filteredMovie(source) - background)));
    vec2 p = (source * vec2(632., 570.) - vec2(316., 286.)) / vec2(271., 251.);
    vec2 radar = (vec2(source.x, 1. - source.y) * vec2(632., 570.) - vec2(316., 271.)) / vec2(242., 230.);
    float leading = -.5 * 3.14159265 + movieTime * 25.13274123 / cycleDuration;
    float tail = mod(leading - atan(radar.y, radar.x) + 25.13274123, 6.28318531);
    float sweep = smoothstep(0., .06, tail) * pow(1. - smoothstep(0., 2.1, tail), 2.);
    alpha *= 1. - smoothstep(.97, 1.02, length(p));
    // Register the source logo under the HD foreground instead of erasing movie pixels above it.
    float radial = smoothstep(.05, .2, length(radar)) * (1. - smoothstep(1.05, 1.45, length(radar)));
    float light = sweep * radial * .27;
    float combined = alpha + light * (1. - alpha);
    vec3 color = (current * alpha + vec3(.72, .025, .008) * light * (1. - alpha)) / max(combined, .00001);
    gl_FragColor = vec4(color, combined);
}`;

