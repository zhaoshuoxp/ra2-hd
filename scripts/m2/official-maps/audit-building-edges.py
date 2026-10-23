"""Validate all selected native building states and write actual-density review pictures."""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from owner_review import compose_owner, frame_palette, paste_linear_preview
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import sha


def read(file):
    return json.loads(file.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scope', type=Path)
    parser.add_argument('base', type=Path)
    parser.add_argument('pack', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    assert not args.output.exists()
    args.output.mkdir(parents=True)
    scope = read(args.scope)
    catalog, old_catalog = read(args.pack/'manifest.json'), read(args.base/'manifest.json')
    contract = read(Path('desktop/environment-hd-contract.json'))
    entries = {row['member']: row for f in catalog['families'].values() for row in f['members']}
    old_entries = {row['member']: row for f in old_catalog['families'].values() for row in f['members']}
    frames, pictures = [], []
    for item in scope['baselineBuildingSources']:
        name, source, guide = item['member'], item['source'], Path(item['root'])
        file, old_file = args.pack/entries[name]['path'], args.base/old_entries[name]['path']
        assert sha(file) == entries[name]['sha256'] and sha(old_file) == old_entries[name]['sha256']
        hd, old = read(file), read(old_file)
        assert hd['source'] == old['source'] and hd['logical'] == old['logical']
        for variant, previous in zip(hd['variants'], old['variants']):
            density, pages = variant['density'], {}
            for declaration in variant['pages']:
                page = declaration['id']
                arrays = []
                for root_file in [file, old_file]:
                    arrays.extend(np.asarray(Image.open(root_file.parent/str(density)/page/f).convert('RGBA'))
                                  for f in ['base.png', 'data.png'])
                pages[page] = arrays
                for filename, key in [('base.png','baseSha256'),('data.png','dataSha256')]:
                    assert sha(file.parent/str(density)/page/filename) == declaration[key]
            rows = []
            owner_exists = False
            for frame in variant['frames']:
                number = frame['nativeFrame']
                original = source['frames'][number]
                w, h = original['size']
                indices_file = guide/'native'/original.get('indexFile', f'{name}-{number}.index')
                assert sha(indices_file) == original['indexSha256']
                indices = np.frombuffer(indices_file.read_bytes(), np.uint8).reshape(h,w)
                x, y, width, height = frame['sampleRect']
                crops = [a[y:y+height,x:x+width] for a in pages[frame['page']]]
                b, d, old_b, old_d = crops
                semantic = contract['sources'][name]
                remap = semantic.get('framePalettes',{}).get(str(number),semantic)['remapable']
                owner = (indices>=16)&(indices<=31) if remap else np.zeros(indices.shape,bool)
                owner_exists |= bool(owner.any())
                alpha = b[:h*density,:w*density,3]
                actual = d[:h*density,:w*density]
                enlarged = indices.repeat(density,0).repeat(density,1)
                assert not b[h*density:,:,3].any() and not b[:,w*density:,3].any()
                assert not d[h*density:,:,0].any() and not d[:,w*density:,0].any()
                assert not ((d[...,0]>0)&(b[...,3]==0)).any()
                assert d[...,1].max(initial=0)<=15 and not d[...,2].any() and (d[...,3]==255).all()
                assert not b[...,:3][b[...,3]==0].any()
                contact=enlarged==12
                np.testing.assert_array_equal(b[:h*density,:w*density][contact],old_b[:h*density,:w*density][contact],
                                              err_msg=f'{name} frame {number} density {density} contact mismatch')
                if owner.any():
                    nearest=ndimage.distance_transform_edt(~owner,return_distances=False,return_indices=True)
                    expected=(indices[tuple(nearest)]-16).repeat(density,0).repeat(density,1)
                    mask=actual[...,0]>0
                    np.testing.assert_array_equal(actual[...,1][mask],expected[mask])
                    expanded_owner=owner.repeat(density,0).repeat(density,1)
                    distance=np.maximum(0,ndimage.distance_transform_edt(~expanded_owner)/density-.5/density)
                    assert not ((distance>1.5)&mask).any(),(name,number,'Owner coverage outside bounded subpixel contour')
                else:
                    assert not actual[...,0].any()
                # Coverage stays in the bounded subpixel neighborhood of the retail silhouette.
                if indices.size and (indices!=0).any():
                    distance=np.maximum(0,ndimage.distance_transform_edt(enlarged==0)/density-.5/density)
                    assert not ((distance>1.5)&(alpha>0)).any(),(name,number,'Body coverage drift')
                before,after=old_d[...,0].sum()/255,d[...,0].sum()/255
                assert not before or abs(after/before-1)<=.06
                frames.append(dict(member=name,frame=number,density=density,owner=bool(owner.any()),
                    alphaFractionalPixels=int(((alpha>0)&(alpha<255)).sum()),
                    ownerFractionalPixels=int(((actual[...,0]>0)&(actual[...,0]<255)).sum()),
                    ownerAreaRatio=float(after/before) if before else None,nativeIndexSha256=original['indexSha256']))
                rows.append((number,b[:h*density,:w*density],d[:h*density,:w*density],original))
            # Split long animations so individual offline pages remain practical.
            for start in range(0,len(rows),4):
                group=rows[start:start+4]
                cw,ch=[v*density for v in source['canvas']]
                panel=max(cw,260)
                for side,rgb in [('red',[255,32,32]),*([('blue',[32,96,255])] if owner_exists else [])]:
                    board=Image.new('RGB',(panel*2,(ch+64)*len(group)),(28,28,28))
                    draw=ImageDraw.Draw(board)
                    for row,(number,b,d,original) in enumerate(group):
                        palette=frame_palette(guide,source,contract['sources'][name],number,rgb)
                        native=np.frombuffer((guide/'native'/original.get('indexFile',f'{name}-{number}.index')).read_bytes(),np.uint8).reshape(*reversed(original['size']))
                        rgba=np.zeros((*native.shape,4),np.uint8);rgba[...,:3]=palette[native];rgba[...,3]=(native!=0)*255
                        native_pic=Image.fromarray(rgba).resize((original['size'][0]*density,original['size'][1]*density),Image.Resampling.NEAREST)
                        hd_pic=compose_owner(Image.fromarray(b),Image.fromarray(d),palette,linear_light=True)
                        top=row*(ch+64)+60;ox,oy=[v*density for v in original['origin']]
                        draw.text((8,top-56),f'{name} / native frame {number} / {side} / {density}X',fill='white',font_size=22)
                        draw.text((8,top-28),'Original',fill='white',font_size=22)
                        draw.text((panel+8,top-28),'HD: subpixel structural edges',fill='white',font_size=22)
                        board.paste(native_pic,((panel-cw)//2+ox,top+oy),native_pic)
                        paste_linear_preview(board,hd_pic,(panel+(panel-cw)//2+ox,top+oy))
                    picture=args.output/f'{name}-{side}-{density}x-{start:03d}.png'
                    board.save(picture)
                    pictures.append(dict(member=name,density=density,ownerColor=side,frames=[r[0] for r in group],
                        file=str(picture.resolve()),sha256=sha(picture),size=board.size))
    report=dict(schema='m2-3-r5-all-building-coverage-audit-v1',status='PASS_ALL_NATIVE_BUILDING_STATES_SUBPIXEL_COVERAGE',
        buildingMembers=len(scope['baselineBuildingSources']),densityFrames=len(frames),ownerFrames=sum(f['owner'] for f in frames),
        packManifestSha256=sha(args.pack/'manifest.json'),frames=frames,pictures=pictures,
        previewPolicy='Linear-light palette replacement and alpha compositing, matching the native sRGB texture path before world lighting',
        visualDuplicateLettering='Human review required; numerical geometry checks alone do not establish glyph appearance.')
    (args.output/'audit.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ['frames','pictures']}))


if __name__=='__main__':
    main()
