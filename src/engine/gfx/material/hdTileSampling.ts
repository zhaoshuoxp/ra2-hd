// Both pool and lookup use top-down byte rows with flipY=false. Public sprite
// UVs retain their original bottom-up atlas convention, including edge taps.
export const hdTileSampling = `
  #ifdef HD_TILE_POOL
  uniform sampler2D hdTileMap;
  uniform vec2 hdVirtualSize;
  uniform vec2 hdPoolSize;
  uniform vec2 hdLookupSize;
  vec2 hdSpriteUv(vec2 uv) {
    vec2 pixel = clamp(floor(vec2(uv.x, 1.0 - uv.y) * hdVirtualSize), vec2(0.0), hdVirtualSize - 1.0);
    vec2 tile = floor(pixel / 4.0);
    vec3 code = floor(texture2D(hdTileMap, (tile + 0.5) / hdLookupSize).rgb * 255.0 + 0.5);
    float index = dot(code, vec3(1.0, 256.0, 65536.0));
    float columns = hdPoolSize.x / 4.0;
    vec2 origin = vec2(mod(index, columns), floor(index / columns)) * 4.0;
    return (origin + mod(pixel, 4.0) + 0.5) / hdPoolSize;
  }
  #ifdef HD_REMAP_TILE_POOL
  uniform sampler2D hdRemapTileMap;
  uniform vec2 hdRemapPoolSize;
  vec2 hdRemapUv(vec2 uv) {
    vec2 physical = floor(hdSpriteUv(uv) * hdPoolSize);
    vec2 tile = floor(physical / 4.0);
    vec3 code = floor(texture2D(hdRemapTileMap, (tile + 0.5) / (hdPoolSize / 4.0)).rgb * 255.0 + 0.5);
    float index = dot(code, vec3(1.0, 256.0, 65536.0));
    float columns = hdRemapPoolSize.x / 4.0;
    vec2 origin = vec2(mod(index, columns), floor(index / columns)) * 4.0;
    return (origin + mod(physical, 4.0) + 0.5) / hdRemapPoolSize;
  }
  #else
  vec2 hdRemapUv(vec2 uv) { return hdSpriteUv(uv); }
  #endif
  #else
  vec2 hdRemapUv(vec2 uv) { return uv; }
  vec2 hdSpriteUv(vec2 uv) { return uv; }
  #endif
`;
