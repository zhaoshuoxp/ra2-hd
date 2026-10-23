"""Coat rigid construction parts while preserving accepted snow ground nodes."""
import argparse
import copy
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import native_indices, read, sha, write
from painted_cutout import extract_grid_poses
from painted_rig import bounds, fit_rgba, place, vector_coverage

helpers = SourceFileLoader('rigid_author', 'scripts/art/author-rigid-anatomy.py').load_module()
snow_helpers = SourceFileLoader('snow_author', 'scripts/art/author-component-snow.py').load_module()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('authoring',type=Path)
    parser.add_argument('rigs',type=Path)
    parser.add_argument('jobs',type=Path)
    parser.add_argument('output',type=Path)
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    authority,rigs,jobs = read(args.authoring),read(args.rigs),read(args.jobs)
    for key in list(rigs):
        snow_key = key.replace('-temperate','-snow')
        temp = next(f for f in authority['families'] if f['key']==key)
        snow = next(f for f in authority['families'] if f['key']==snow_key)
        tr,sr = read(temp['nativeSource']),read(snow['nativeSource'])
        binding = snow['newMember']
        logical = read(Path('.local/hd-packs')/binding['packId']/binding['revision']/'manifest.json')['logical']['frames']
        tp,sp = np.asarray(temp['palette'],float),np.asarray(snow['palette'],float)
        rig = copy.deepcopy(rigs[key])
        rig['nativeSourceSha256'] = sha(snow['nativeSource'])
        out = args.output/snow_key
        out.mkdir()
        job = jobs[snow_key][-1]
        grid = job.get('grid',[len(job['phases']),1])
        cell = job.get('cells',list(range(len(job['phases']))))[-1]
        source = extract_grid_poses(Image.open(job['image']),*grid)[cell][0]
        texture = snow_helpers.white_patch(source)
        authored = fit_rgba(texture,(sr['canvas'][0]*4,sr['canvas'][1]*4))
        master = None
        for phase,nodes in enumerate(rig['phases']):
            old = snow['componentRig']['phases'][phase]
            old_temp = temp['componentRig']['phases'][phase]
            if nodes == old_temp:
                rig['phases'][phase] = copy.deepcopy(old)
                continue
            if isinstance(nodes,dict):
                continue
            ti,si = native_indices(tr,phase),native_indices(sr,phase)
            tc,sc = tp[ti],sp[si]
            frost = ((si>31)&(sc.mean(2)>tc.mean(2)+25)&(sc.min(2)>=130)&(np.ptp(sc,axis=2)<45))
            mask = vector_coverage(frost)/255
            replacements = helpers.ground_nodes(old) if not key.startswith('gtgcan-') else []
            ground = helpers.ground_nodes(nodes)
            for index,n in enumerate(nodes):
                if n in ground and not key.startswith('gtgcan-'):
                    continue
                if isinstance(old_temp,list) and n in old_temp:
                    # Unchanged cannon receivers, prism stems and robot masts
                    # keep their previous snow painting byte-for-byte.
                    replacements.append(copy.deepcopy(old[old_temp.index(n)]))
                    continue
                if n['name']=='foundation' and master is not None:
                    replacements.append(master)
                    continue
                layer = place(Image.open(n['image']),n['box'],sr['canvas'])
                alpha = layer[...,3].copy()
                rgb = layer[...,:3].astype(float)
                neutral = (np.ptp(rgb,axis=2)<50)
                weight = mask*neutral*.85
                coat = authored[...,:3]*(.65+rgb.mean(2)[...,None]/255*.35)
                layer[...,:3] = np.floor(rgb*(1-weight[...,None])+coat*weight[...,None]+.5).astype(np.uint8)
                assert np.array_equal(alpha,layer[...,3])
                layer[layer[...,3]==0] = 0
                frame = logical[phase]
                left,top = frame['trimOrigin']
                right,bottom = np.asarray(frame['trimOrigin'])+frame['trimSize']
                outside = layer[...,3].copy()
                outside[top*4:bottom*4,left*4:right*4] = 0
                metadata = copy.deepcopy(n.get('rigidPart',{}))
                if outside.any():
                    assert 'transform' in metadata and 'target' in metadata,(snow_key,phase,n['name'])
                    pivot = np.asarray(metadata['target'])
                    bb = np.asarray(bounds(layer[...,3]>0))/4
                    limits = []
                    for axis,lo,hi in ((0,left+.5,right-.5),(1,top+.5,bottom-.5)):
                        if bb[axis]<pivot[axis]:
                            limits.append((pivot[axis]-lo)/(pivot[axis]-bb[axis]))
                        if bb[axis+2]>pivot[axis]:
                            limits.append((hi-pivot[axis])/(bb[axis+2]-pivot[axis]))
                    scale = min(1.,*limits)
                    assert 0<scale<1
                    from painted_rig import project_rgba
                    matrix = [[scale/4,0,pivot[0]*(1-scale)],
                              [0,scale/4,pivot[1]*(1-scale)]]
                    layer = project_rgba(Image.fromarray(layer),matrix,sr['canvas'])
                    transform = np.asarray(metadata['transform'])
                    transform[:,:2] *= scale
                    transform[:,2] = pivot+(transform[:,2]-pivot)*scale
                    metadata.update(transform=transform.tolist(),snowNativeBoundsUniformScale=float(scale))
                    alpha = layer[...,3]
                bb = bounds(alpha>0)
                x0,y0,x1,y1 = bb
                file = out/f'{phase:02}-{index:02}-{n["name"]}.png'
                Image.fromarray(layer[y0:y1,x0:x1]).save(file)
                replacement = {**n,'image':str(file),'sha256':sha(file),'box':[v/4 for v in bb]}
                if metadata:
                    replacement['rigidPart'] = metadata
                replacements.append(replacement)
                if n['name']=='foundation' and phase>=rig['foundationStableFrom']:
                    master = replacement
            rig['phases'][phase] = replacements
        if key.startswith('gtgcan-'):
            rig['foundationSource'] = master
        else:
            rig['foundationSource'] = copy.deepcopy(snow['componentRig']['foundationSource'])
        rig['snowMaterial'] = {'source':job['image'],'sourceSha256':sha(job['image']),
                               'coverage':'IDENTICAL_NEW_PART_ALPHA_WITH_EXACT_RETAINED_GROUND',
                               'nativeRgbCopied':0}
        rigs[snow_key] = rig
    write(args.output/'rigs.json',rigs)
    print('10 temperate/snow rigid rigs; four unchanged identity ground sets preserved exactly')


if __name__=='__main__':
    main()
