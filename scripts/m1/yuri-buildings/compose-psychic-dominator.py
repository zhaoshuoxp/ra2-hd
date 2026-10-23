"""Complete well, four articulated upper claws and native electrical states."""
import sys
import json
import numpy as np
from PIL import Image
from production_common import ROOT, Family, row_for, resting, cells, indices, decode, clip
from mechanical_common import register_anchored, ground_plane, project_registered_master, articulate_raw_part
from native_effects import electrical
from construction_motion import telescope, local_top

output = sys.argv[1]
reuse_exports = next((v.split('=', 1)[1] for v in sys.argv[2:] if v.startswith('--reuse-exports=')), None)
dry = row_for('YAPPET')
source = ROOT / 'production-art-v1/YAPPET/mechanical-parts-raw.png'
_, petal_key, _ = cells(source, 3)
hinge_source = ROOT / 'feedback-v1/hinge-parts-raw.png'
right_key, hub_key, left_key, strut_key = cells(hinge_source, 4)
assert hub_key[1][0] < 700 and right_key[1][0] > 700


def segments(key, shoulder, elbow, tip):
    image, region = key
    yy, xx = np.indices(image.size[::-1])
    direction = np.array(tip, float) - elbow
    direction /= np.linalg.norm(direction)
    along = (xx + region[0] - elbow[0]) * direction[0] + (yy + region[1] - elbow[1]) * direction[1]
    # Split through the joint center. An independently seated pivot housing
    # covers the moving seam without separating the entire lower blade.
    return [(clip(image, Image.fromarray(np.uint8(along <= 0) * 255)), (shoulder, elbow)),
            (clip(image, Image.fromarray(np.uint8(along > 0) * 255)), (elbow, tip))]


right_segments = segments(right_key, (832, 105), (1162, 331), (1325, 533))
left_segments = segments(left_key, (587, 645), (251, 854), (126, 1047))
floor_source = ROOT / 'production-art-v1/YAPPET/bare-foundation-raw.png'
roots = [(112, 105), (127, 116), (146, 114), (153, 101)]
for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        f = Family('YAPPET', theater, density, output)
        previous_folder = ROOT / reuse_exports / f'YAPPET-{theater}-{density}x' if reuse_exports else None
        previous = json.loads((previous_folder / 'candidate-review.json').read_text()) if previous_folder else None
        if previous:
            assert (previous['identity'], previous['theater'], previous['density']) == ('YAPPET', theater, density)
            f.local_parts.extend(previous.get('localPartTransforms', []))
        def reuse(member, n, source_member=None, source_frame=None):
            if previous is None:
                return False
            source_member = source_member or member
            source_frame = n if source_frame is None else source_frame
            record = next(r for r in previous['frames'] if r['member'] == source_member['source']['member'] and r['nativeFrame'] == source_frame)
            image = f.blank()
            data = Image.new('RGBA', f.size, (0, 0, 0, 255))
            if record['base']:
                origin = tuple(record['native'][k] * density for k in ('x', 'y'))
                image.paste(Image.open(previous_folder / record['base']), origin)
                data.paste(Image.open(previous_folder / record['data']), origin)
            f.put(member, n, image, 'Same-density complete v2 frame retained byte-for-byte; ' + record['operation'], data=data)
            return True
        body, rest, opening, charged, closing, active, build = f.row['members']
        closed, wells = [], []
        for damage, p in enumerate([ROOT / 'art-v1/YAPPET-TEMPERATE/normal-raw.png', ROOT / 'production-art-v1/YAPPET/damaged-raw.png']):
            closed.append(f.register(Image.open(p), resting(dry, bool(damage)).getbbox(), p))
            name = 'damaged-fixed-well-raw.png' if damage else 'fixed-well-raw.png'
            well, _ = register_anchored(f, ROOT / 'production-art-v1/YAPPET' / name, f.registrations[-1], allow_canvas_rounding=True)
            wells.append(well)
        hub = f.register(hub_key[0], (123, 33, 146, 54), hinge_source, source_region=hub_key[1])
        petal = f.register(petal_key[0], (110, 72, 132, 119), source, source_region=petal_key[1]); petal_reg = f.registrations[-1]
        floor = f.register(Image.open(floor_source), (71, 109, 196, 175), floor_source)
        ground = ground_plane(floor)
        def petals(aperture):
            result = f.blank()
            for i, (x, y) in enumerate(roots):
                outward = -1 if i < 2 else 1
                top_x = x + outward * aperture * 24
                top_y = y - 47 + aperture * 37
                quad = [(top_x-11, top_y), (top_x+11, top_y), (x+11, y), (x-11, y)]
                source_quad = [(110,72),(132,72),(132,119),(110,119)]
                if i % 2: source_quad = [(132,72),(110,72),(110,119),(132,119)]
                result.alpha_composite(project_registered_master(f, source, petal_reg, source_quad, quad))
            return result
        def mechanism(aperture, rise):
            result = f.blank()
            def strut(root, socket, width=2.5):
                result.alpha_composite(articulate_raw_part(f, hinge_source, strut_key[0], strut_key[1],
                    [(800, 648), (1360, 949)], [root, socket], 180, width))
            # Fixed well sockets support the raised cage. Local arms move about
            # their shoulder and elbow, never about a changing image envelope.
            for root, socket in [((112, 103), (113 - aperture * 10, 61 - rise - aperture * 5)),
                                 ((153, 101), (153 + aperture * 11, 60 - rise - aperture * 5))]:
                strut(root, socket)
            strut((134, 95), (134, 49 - rise), 3)
            for i in (0, 1, 2, 3):
                side = -1 if i % 2 == 0 else 1
                rear = i < 2
                shoulder = (134 + side * (4 if rear else 8), (41 if rear else 47) - rise)
                elbow = (134 + side * (9 + aperture * (8 if rear else 22)),
                         (60 if rear else 67) - rise - aperture * (4 if rear else 7))
                tip = (134 + side * (4 + aperture * (7 if rear else 14)),
                       (70 if rear else 78) - rise - aperture * 2)
                key, parts = (left_key, left_segments) if side < 0 else (right_key, right_segments)
                for (part, axis), target in zip(parts, [(shoulder, elbow), (elbow, tip)]):
                    result.alpha_composite(articulate_raw_part(f, hinge_source, part, key[1], axis, target,
                                                              180, 4 if rear else 5.5))
                joint = np.array(parts[0][1][1]); yy, xx = np.indices(key[0].size[::-1])
                cap = clip(key[0], Image.fromarray(np.uint8((xx + key[1][0] - joint[0])**2 +
                    (yy + key[1][1] - joint[1])**2 <= 75**2) * 255))
                result.alpha_composite(articulate_raw_part(f, hinge_source, cap, key[1],
                    [joint + (-75, 0), joint + (75, 0)],
                    [(elbow[0]-3, elbow[1]), (elbow[0]+3, elbow[1])], 150, 6))
                if i == 1:
                    result.alpha_composite(f.translate(hub, dy=-rise))
            return result
        def head_top(member, n):
            native = np.array(decode(f.row, member, n)); r,g,b = np.moveaxis(native[..., :3].astype(float),2,0)
            yy,xx=np.indices(r.shape)
            metal=(native[...,3]>0)&(yy<50)&(xx>112)&(xx<155)
            metal &= ~((r>g*1.4)&(b>g*1.4)) & ~((r>220)&(g>220)&(b>220))
            return np.where(metal)[0].min() if metal.any() else 33
        def pose(member, n, damage):
            control_frame = 18 if n == 19 and member in (opening, closing) else n
            rise=max(-8,min(26,float(33-head_top(member, control_frame))))
            # Normal playback includes slot 19 although the source's two
            # pose banks are 19 slots long. It is the normal endpoint guard,
            # not the first pose of the second bank.
            native_phase = min(n, 18) if n <= 19 else n - 19
            if member not in (opening, closing):
                native_phase = n % 8
            aperture = min(1,native_phase/7) if member is opening else max(0,min(1,(18-native_phase)/7)) if member is closing else 1 if member is charged else 0
            result = closed[int(damage)].copy() if aperture == 0 else wells[int(damage)].copy()
            if aperture: result.alpha_composite(petals(aperture))
            result.alpha_composite(mechanism(aperture, rise))
            result.alpha_composite(electrical(f,member,n))
            return result
        for n in range(body['visibleFrames']):
            if reuse(body, n): continue
            f.put(body,n,f.snow(body,n,closed[int(n!=0)]),'Complete closed approved chamber architecture; native complete super-member visibility requires runtime verification')
        for member in (rest,opening,charged,closing):
            for n in range(member['visibleFrames']):
                if n == 19 and member in (opening, closing):
                    # Match the actual next resting pose exactly at release;
                    # source bank modulo arithmetic must not reopen this guard.
                    if reuse(member, n, rest if member is closing else opening, 0 if member is closing else 18):
                        continue
                if n != 19 and head_top(member, n) <= 33 and reuse(member, n): continue
                damage=n==1 if member is rest else n>=20 if member in (opening, closing) else n>=9
                f.put(member,n,f.snow(member,n,pose(member,n,damage)),
                    'Approved well and petals; complete four upper claws separately articulated at shoulder and elbow, compact hub and fixed socket struts; original-master sampling and native normal/damaged electrical control')
        for n in range(active['visibleFrames']):
            if reuse(active, n): continue
            native=indices(active,n)
            assert np.count_nonzero(native > 1) < 64 and not ((native >= 16) & (native <= 31)).any(), 'Unexpected large or owner-painted active mechanism'
            f.put(active,n,decode(f.row,active,n).resize(f.size,Image.Resampling.BICUBIC),
                'Retained sparse original electrical/metal-face phase control over complete photographic super chamber; no new photographic detail claim')
        for n in range(build['visibleFrames']):
            result=floor.copy()
            aperture=float(np.clip((n-1)/8,0,1)) if n<10 else float(np.clip((23-n)/9,0,1))
            if n>=2:
                result.alpha_composite(clip(telescope(f,wells[0],build,n,(99,68,113,175),15),ground))
                result.alpha_composite(clip(telescope(f,petals(aperture),build,n,(120,70,144,175),12),ground))
            if n>=1:
                rise=33-local_top(f,build,n,(123,0,145,160))
                result.alpha_composite(clip(mechanism(aperture,rise),ground))
            if n==build['visibleFrames']-1: result=closed[0].copy();result.alpha_composite(mechanism(0, 0))
            f.put(build,n,f.snow(build,n,result),'Fixed well/foundation; native head track and four shoulder/elbow hinges open during assembly and close onto the chamber; stationary wall texture; exact closed endpoint')
        f.export()
