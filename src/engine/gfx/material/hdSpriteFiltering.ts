// Remap-aware linear-light coverage filter; texture bytes and palette indices stay intact.
import { embeddedShadowDeclarations } from './embeddedShadowFiltering';

export const hdFilterDeclarations = `
      uniform vec2 hdTextureSize;
      uniform float hdMinFootprint;
      uniform float hdPass;
      uniform bool hdFiltering;
      varying vec4 vHdFrameRect;
      ${embeddedShadowDeclarations}
      vec4 hdResolve(vec2 cell, float row) {
        vec2 uv = (cell + 0.5) / hdTextureSize;
        if (any(lessThan(uv, vHdFrameRect.xy)) || any(greaterThan(uv, vHdFrameRect.zw))) return vec4(0.0);
        #ifdef INDEXED_COVERAGE
        float index = texture2D(map, uv).a;
        #ifdef EMBEDDED_SHP_SHADOW
        if (shadowAntialias && abs(index * 255.0 - 12.0) < 0.5) return vec4(0.0);
        #endif
        vec4 color = texture2D(palette, vec2(index, (row + 0.5) / paletteOffsetCount.y));
        return vec4(color.rgb * color.a, color.a);
        #else
        vec2 sampleUv = hdSpriteUv(uv);
        vec4 base = texture2D(map, sampleUv);
        if (base.a == 0.0) return vec4(0.0);
        #ifdef EMBEDDED_SHP_SHADOW
        if (shadowAntialias && embeddedGround(uv, base)) return vec4(0.0);
        #endif
        vec4 data = texture2D(remapMap, hdRemapUv(uv));
        float shade = (16.0 + floor(data.g * 255.0 + 0.5)) / 255.0;
        vec3 owner = texture2D(palette, vec2(shade, (row + 0.5) / paletteOffsetCount.y)).rgb;
        return vec4(mix(base.rgb, owner, data.r) * base.a, base.a);
        #endif
      }
      vec4 hdArea(vec2 uv, float row, float minimum) {
        vec2 p = uv * hdTextureSize;
        // Box coverage for axis-aligned SHP footprints, including the 720p preset.
        // Bound work for unusually small windows; atlas frames never bleed.
        vec2 footprint = clamp(abs(dFdx(p)) + abs(dFdy(p)), vec2(minimum), vec2(8.0));
        vec2 lo = p - footprint * 0.5, hi = p + footprint * 0.5;
        vec2 first = floor(lo);
        vec4 result = vec4(0.0);
        for (int y = 0; y < 10; y++) {
          if (first.y + float(y) >= hi.y) break;
          for (int x = 0; x < 10; x++) {
            vec2 cell = first + vec2(float(x), float(y));
            if (cell.x >= hi.x) break;
            vec2 weight = max(vec2(0.0), min(cell + 1.0, hi) - max(cell, lo));
            result += hdResolve(cell, row) * weight.x * weight.y;
          }
        }
        return result / (footprint.x * footprint.y);
      }
    `;

export const hdFilterFragment = `
  if (hdFiltering) {
    if (hdPass < 0.5) discard;
    vec4 filtered = hdArea(vMapUv, paletteRow, 1.0);
    #ifdef NEAREST_INDEXED_BODY
    filtered = hdResolve(floor(vMapUv * hdTextureSize), paletteRow);
    #endif
    if (hdMinFootprint > 1.0) {
      vec4 edgeCoverage = hdArea(vMapUv, paletteRow, hdMinFootprint);
      // Reconstruct the silhouette at native sprite-pixel width without blurring opaque HD detail.
      if (edgeCoverage.a < 0.995) filtered = edgeCoverage;
    }
    #ifdef EMBEDDED_SHP_SHADOW
    if (shadowAntialias) filtered.a += embeddedShadowCoverage(vMapUv) * (1.0 - filtered.a);
    #endif
    diffuseColor.rgb = filtered.rgb / max(filtered.a, 0.000001);
    // Alpha-254 export rounding remains opaque, matching the accepted C trial.
    if (hdPass < 1.5 && filtered.a < 0.995) discard;
    if (hdPass > 1.5 && hdPass < 2.5 && (filtered.a >= 0.995 || filtered.a <= 0.001)) discard;
    diffuseColor.a = (hdPass < 1.5 ? 1.0 : filtered.a) * opacity;
    #ifdef INSTANCE_OPACITY
      diffuseColor.a *= vInstanceOpacity;
    #endif
  } else if (hdPass > 1.5) discard;
`;
