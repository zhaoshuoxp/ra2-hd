"""Remove the duplicated healthy crane shell from the foreground shipyard base."""
import argparse
import copy
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import pack_flat, read, sha, unpack, write
from painted_rig import place

original = SourceFileLoader('yard_original', 'scripts/art/author-infrastructure-original.py').load_module()
base, terminal = original.base, original.terminal
POLYGON = [(190,112.75),(244,112.75),(244,124),(224,136),(198,130),(190,120)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    root = Path('.artifacts/buildup-remaining-20261013-r74-v1')
    prior = root/'infrastructure-original-r85-v1'
    baseline_path = prior/'selected-v1/authoring.json'
    baseline = read(baseline_path)
    legacy = read(root/'infrastructure-motion-r84-v1/registered-v2/authoring.json')
    out = args.output
    out.mkdir(exist_ok=False)
    snapshot = out/'authoring-source.py'
    shutil.copy2(__file__, snapshot)
    accepted = copy.deepcopy(baseline)
    accepted_keys = read(root/'weather-depot-motion-r81-v1/registered-v1/authoring.json')['hdRepaintProgress']['registeredCandidateKeys']
    accepted_keys = sorted(set(accepted_keys) | {r['key'] for r in baseline['families'] if r['identity'] in ['GAREFN','NAHAND'] or r['key']=='gayard-snow'})
    assert len(accepted_keys) == 37
    accepted['hdRepaintProgress']['registeredCandidateKeys'] = accepted_keys
    write(out/'accepted-authoring.json', accepted)
    write(out/'user-acceptance.json', {'status':'V20_OTHER_REVIEWED_VISUALS_ACCEPTED_YARD_CENTER_SEAM_REOPENED',
        'baseline':str(baseline_path),'sha256':sha(baseline_path),'acceptedKeys':accepted_keys,
        'reopenedKeys':['gayard-temperate'], 'acceptedYardContext':'Motion, proportions and other parts',
        'otherPendingFamilies':['NAPOWR','NARADR','NAREFN'],'windows':'NOT_RUN'})
    authority = copy.deepcopy(baseline)
    checks, rigs = [], {}
    original.SOURCE = {'code':str(snapshot),'sha256':sha(snapshot),'material':'EXACT_RETAINED_CRANE_LAYER_WITH_DUPLICATED_FOREGROUND_SHELL_REMOVED'}
    original.SURFACE = prior/'barracks-panel-surfaces-v1.png'
    for rec in authority['families']:
        if rec['key'] != 'gayard-temperate':
            continue
        family = read(rec['newFamilyPath'])
        old_member = next(m for m in family['members'] if m['member'] in ['ggyard.shp','gayard.shp'])
        old_root = Path('.local/hd-packs')/old_member['packId']/old_member['revision']
        manifest = read(old_root/'manifest.json')
        new_root = old_root.parent/'yard-shell-overlap-r86-v2'
        new_root.mkdir(exist_ok=False)
        result = copy.deepcopy(manifest)
        result['packRevision'] = new_root.name
        result['variants'] = []
        mask4 = terminal.polygon((304*4,432*4,4),POLYGON)
        for density in [2,4]:
            mask = np.array(Image.fromarray(mask4).resize((432*density,304*density),Image.Resampling.NEAREST))
            frames=[]
            for phase,f in enumerate(manifest['logical']['frames']):
                pair = [unpack(old_root,manifest,density,phase,role) for role in ['base','data']]
                if phase == 0:
                    pair[0][mask] = 0
                    pair[1][mask,:3] = 0
                x,y=[v*density for v in f['trimOrigin']]
                w,h=[v*density for v in f['legacyRenderSize']]
                frames.append([a[y:y+h,x:x+w] for a in pair])
            result['variants'].append(pack_flat(frames,result['logical']['frames'],density,new_root))
        result['localizedRepair']={'method':'REMOVE_DUPLICATED_FOREGROUND_CRANE_SHELL','polygon':POLYGON,
            'changedFrames':[0],'damagedAndShadowFrames':'EXACT','baseline':str(old_root/'manifest.json'),
            'baselineSha256':sha(old_root/'manifest.json')}
        write(new_root/'manifest.json',result)
        member={**old_member,'revision':new_root.name,'sha256':sha(new_root/'manifest.json')}
        family['members']=[member if m==old_member else m for m in family['members']]
        family_path=Path(rec['newFamilyPath']).parent.parent/'yard-shell-overlap-r86-v2/family.json'
        write(family_path,family)
        rec.update(newFamilyPath=str(family_path),newFamilySha256=sha(family_path))
        seed=copy.deepcopy(rec)
        seed['componentRig']=next(f for f in legacy['families'] if f['key']==rec['key'])['componentRig']
        scene=base.Scene(seed,root/'infrastructure-r82-v1',root/('infrastructure-r82-v1/reference-'+rec['theater'].lower()+'-v1/report.json'),out/rec['key'])
        # Old bearing/drum masks are retained, but their duplicate shell pixels use
        # the continuous completed crane layer. All motion parameters stay exact.
        source_layer=original.motion.source_layer
        def corrected_layer(s,p,name):
            layer=source_layer(s,p,name)
            selected=mask4 & (layer[...,3]>0)
            layer[selected]=s.full[selected]
            return layer
        original.motion.source_layer=corrected_layer
        try:
            rigs[rec['key']]=original.yard(scene)
        finally:
            original.motion.source_layer=source_layer
        checks.append({'key':rec['key'],'oldMember':old_member,'newMember':member,
            'polygon':POLYGON,'changedBaseFrame':0,'retainedAnimationMembers':'EXACT','motionParameters':'EXACT_V20'})
    write(out/'completed-layer-authoring.json',authority)
    write(out/'rigs.json',rigs)
    write(out/'overlap-repair.json',{'status':'AUTHORED_LOCAL_DUPLICATE_REMOVAL','checks':checks})
    print('One screenshot-matched shipyard rig and localized healthy base overlay authored',flush=True)


if __name__=='__main__':main()
