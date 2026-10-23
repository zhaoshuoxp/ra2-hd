"""Compose actual initial-idle members in the retained construction canvas."""
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import read, sha
from painted_rig import over, project_rgba

terminal=SourceFileLoader('terminal_author','scripts/art/author-terminal-alignment.py').load_module()


def display(record, exclude_members=()):
    reference=record['componentRig']['retainedIdleCompletion']['reference']
    report_file=Path(reference['nativeReport'])
    assert sha(report_file)==reference['sha256']
    case=read(report_file)['cases'][record['identity']]
    family=read(record['newFamilyPath'])
    binding=record['newMember']
    root=Path('.local/hd-packs')/binding['packId']/binding['revision']
    logical=read(root/'manifest.json')['logical']
    frame=logical['frames'][-1]
    mk=next(g for g in case['readyState']['spriteGeometry']
            if g['sourceMember'].endswith('mk.shp') and g['frame']==record['frames']-1)['screenBounds']
    sx=(mk[2]-mk[0])/frame['legacyRenderSize'][0]
    sy=(mk[3]-mk[1])/frame['legacyRenderSize'][1]
    layers=[]
    for geometry in case['poseCheck']['initialIdleGeometry']:
        if geometry['sourceMember'] in exclude_members:
            continue
        member=next((m for m in family['members'] if m['member']==geometry['sourceMember']),None)
        if member is None:
            # Snow can reuse a theater-neutral HD family whose declared source
            # names use the generic theater prefix. Confirm the actual binding.
            name=geometry['sourceMember']
            alias=name[:1]+'g'+name[2:]
            member=next(m for m in family['members'] if m['member']==alias)
            actual=next(g for g in case['readyState']['spriteGeometry']
                        if g['frameOffset']==geometry['frameOffset'])
            assert record['theater']=='SNOW' and member['sha256'] in actual['identity']
        source_root=Path('.local/hd-packs')/member['packId']/member['revision']
        metadata=read(source_root/'manifest.json')['logical']['frames'][geometry['frame']]
        projected=geometry['screenBounds']
        dx=frame['trimOrigin'][0]+(projected[0]-mk[0])/sx-metadata['trimOrigin'][0]
        dy=frame['trimOrigin'][1]+(mk[3]-projected[3])/sy-metadata['trimOrigin'][1]
        rgba=terminal.render_member(record,member,geometry['frame'])
        image=project_rgba(Image.fromarray(rgba),[[.25,0,dx],[0,.25,dy]],logical['canvas'])
        layers.append((geometry['depth'],image,geometry['sourceMember']))
    canvas=np.zeros((logical['canvas'][1]*4,logical['canvas'][0]*4,4),np.uint8)
    order=record['componentRig']['retainedIdleCompletion'].get('layerOrder')
    if order:
        ordered=sorted(layers,key=lambda entry:order.index(entry[2]))
    else:
        ordered=sorted(layers,key=lambda entry:entry[0],reverse=True)
    for _,layer,_ in ordered:
        canvas=over(layer,canvas)
    return canvas
