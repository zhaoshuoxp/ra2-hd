"""Project accepted road detail onto compatible native bridge deck coordinates."""
import numpy as np
from scipy import ndimage


def project_asphalt(authored, template, native_band, native_alpha, origin, slot, density):
    """Share actual material variation, retaining authored paint and damage coverage."""
    negative = slot < 9
    colors = template[..., :3].astype(float)
    material = (template[..., 3] > 0) & (colors.max(2) < 132) & (np.ptp(colors, axis=2) < 20)
    assert material.any()
    nearest = ndimage.distance_transform_edt(~material,return_distances=False,return_indices=True)
    colors = colors[tuple(nearest)]
    y,x = np.indices(authored.shape[:2]);x=(x+.5)/density+origin[0];y=(y+.5)/density+origin[1]
    # Native palette line/phase audit establishes these full-canvas translations.
    # The fixed projection survives trimmed/damaged frames without frame scaling.
    if negative:
        cross=x-2*y+2;along=(x+2*y-62-88)%60+88
        sx=(cross+along)/2;sy=(along-cross)/4
    else:
        cross=x+2*y-92;along=(x-2*y+32+30)%60-30
        sx=(cross+along)/2;sy=(cross-along)/4
    sampled=np.stack([ndimage.map_coordinates(colors[...,c],[sy*density-.5,sx*density-.5],
        order=1,mode='nearest') for c in range(3)],axis=-1)
    rgb=authored.astype(float)
    weight=np.clip((140-rgb.max(2))/25,0,1)*np.clip((50-np.ptp(rgb,axis=2))/20,0,1)
    weight*=np.clip((rgb.mean(2)-20)/20,0,1)
    weight*=(native_band & native_alpha).repeat(density,0).repeat(density,1)
    detail=rgb-ndimage.gaussian_filter(rgb,(density*2,density*2,0))
    sampled+=np.clip(detail,-12,12)*.2
    return np.uint8(np.clip(rgb*(1-weight[...,None])+sampled*weight[...,None],0,255)),dict(
        policy='SHARED_ACCEPTED_ROAD_TEXTURE_ON_NATIVE_OVERLAY_DECK',changedPixels=int((weight>0).sum()),
        orientation='proad01' if negative else 'proad02',nativeCanvasOrigin=origin,
        crossTranslation=-2 if negative else 92,alongTranslation=62 if negative else -32,
        periodNativePixels=60,paint='AUTHORED_HIGH_RESOLUTION_COLOR_MASK',alpha='EXACT_TARGET_NATIVE')
