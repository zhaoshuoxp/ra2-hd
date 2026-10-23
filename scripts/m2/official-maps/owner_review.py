"""Compose static HD review pixels using the runtime palette replacement equation."""
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image


def frame_palette(prepared, source, declaration, number, owner_rgb=None):
    identity = declaration.get('framePalettes', {}).get(str(number), source['palette'])
    for relative in [identity['member'], identity['sha256'] + '.pal']:
        file = Path(prepared) / 'native' / relative
        if file.exists() and hashlib.sha256(file.read_bytes()).hexdigest() == identity['sha256']:
            colors = np.frombuffer(file.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
            break
    else:
        raise AssertionError(('Pinned palette missing', identity))
    remapable = declaration.get('framePalettes', {}).get(str(number), declaration)['remapable']
    if owner_rgb is not None and remapable:
        factors = np.asarray([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8])
        colors[16:32] = np.floor(np.asarray(owner_rgb)[None, :] / 255 * factors[:, None] * 4)
    return colors.astype(np.uint8)


def srgb_to_linear(rgb):
    value=np.asarray(rgb,dtype=np.float64)/255
    return np.where(value<=.04045,value/12.92,((value+.055)/1.055)**2.4)


def linear_to_srgb(rgb):
    value=np.clip(rgb,0,1)
    return np.uint8(np.rint(np.where(value<=.0031308,value*12.92,1.055*value**(1/2.4)-.055)*255))


def compose_owner(base, data, palette, linear_light=False):
    base, data = np.asarray(base.convert('RGBA')), np.asarray(data.convert('RGBA'))
    assert base.shape == data.shape
    mask = data[..., 0].astype(np.float64)[..., None] / 255
    shades = data[..., 1].astype(np.uint16)
    assert (shades[data[..., 0] > 0] <= 15).all()
    result = base.copy()
    if linear_light:
        result[..., :3]=linear_to_srgb(srgb_to_linear(base[..., :3])*(1-mask)+srgb_to_linear(palette[16+shades])*mask)
    else:
        result[..., :3] = np.rint(base[..., :3] * (1 - mask) + palette[16 + shades] * mask).astype(np.uint8)
    return Image.fromarray(result)


def paste_linear_preview(board,picture,origin):
    x,y=origin
    source=np.asarray(picture.convert('RGBA'))
    background=np.asarray(board.crop((x,y,x+picture.width,y+picture.height)).convert('RGB'))
    alpha=source[...,3:4].astype(np.float64)/255
    result=linear_to_srgb(srgb_to_linear(source[...,:3])*alpha+srgb_to_linear(background)*(1-alpha))
    board.paste(Image.fromarray(result),origin)
