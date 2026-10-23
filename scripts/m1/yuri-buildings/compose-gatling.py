"""Gatling: fixed pedestal, local emerging socket and pitched barrel assembly."""
import sys
import json
import numpy as np
from PIL import Image
from scipy import ndimage
from production_common import ROOT, Family, row_for, decode, cells, clip
from mechanical_common import ground_plane, project_part, project_registered_master

output = sys.argv[1]
for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        f = Family('YAGGUN', theater, density, output)
        body, build = f.row['members']
        dry = row_for('YAGGUN')
        source = ROOT / 'art-v1/YAGGUN-TEMPERATE/normal-raw.png'
        normal = f.register(Image.open(source), decode(dry, dry['members'][0], 0).getbbox(), source)
        key_source = ROOT / 'production-art-v1/YAGGUN/keys-raw.png'
        keys = cells(key_source, 3)
        damaged = f.register(keys[0][0], decode(dry, dry['members'][0], 1).getbbox(),
                             key_source, proportional=True, source_region=keys[0][1])
        gun_source = ROOT / 'art-v1/YAGGUN-TURRET-0/normal-raw.png'
        contract = json.load(open('desktop/building-turret-contracts.json'))['YAGGUN']
        gun = f.blank()
        turrets = next((v.split('=', 1)[1] for v in sys.argv if v.startswith('--turrets=')), 'turret-exports-v2')
        live = Image.open(ROOT / f'{turrets}/YAGGUN/{density}/0.png').convert('RGBA')
        turret_manifest = json.load(open(ROOT / f'{turrets}/YAGGUN/{density}/manifest.json'))
        origin = [round((f.body['canvas'][i]/2 + float(dry['rules'][['TurretAnimX','TurretAnimY'][i]])
                         + contract['offset'][i]) * density) for i in range(2)]
        # The same logical registration as GatlingRegistration.ts; the
        # receiver center remains on the measured yaw axis above its lower bearing.
        pivot = json.load(open('desktop/gatling-pivots.json'))
        if not turret_manifest.get('nativePivot'):
            origin = [origin[i] + round((pivot['targetPivot'][i] - pivot['pivots']['0'][i]) * density) for i in range(2)]
        gun.alpha_composite(live, tuple(origin))
        high_source = ROOT / 'production-art-v1/YAGGUN/high-gun-raw.png'
        high = f.register(Image.open(high_source), (42, 4, 84, 44), high_source, proportional=True)
        high_registration = f.registrations[-1]
        def mount(image):
            a=np.array(image.getchannel('A'));box=image.getbbox()
            yy,xx=np.where((a>=240)&(np.indices(a.shape)[0]>=box[3]-4*density))
            return np.array([np.median(xx)/density,box[3]/density])
        mount_delta=mount(gun)-mount(high)
        rear_quad = [(54, 19), (64, 2), (72, 6), (62, 24)]
        rear_low = [(55, 22), (64, 14), (72, 18), (62, 27)]
        front_quad = [(62, 31), (73, 11), (81, 15), (70, 36)]
        front_low = [(62, 34), (81, 22), (88, 27), (70, 39)]
        white = Image.new('RGBA', f.size, 'white')
        barrel_mask = np.maximum(np.array(f.polygon(white, rear_quad).getchannel('A')),
                                 np.array(f.polygon(white, front_quad).getchannel('A')))
        receiver = clip(high, Image.fromarray(255 - barrel_mask))
        # Masked muzzle AA can leave a disconnected sliver in the stationary
        # receiver. Keep the connected receiver assembly, not those residues.
        labels, count = ndimage.label(np.array(receiver.getchannel('A')) >= 128, np.ones((3, 3)))
        component = 1 + np.bincount(labels.ravel())[1:].argmax()
        support = ndimage.binary_dilation(labels == component, iterations=1)
        receiver = clip(receiver, Image.fromarray(np.uint8(support) * 255))
        yy = np.indices(f.size[::-1])[0]
        mount_plane = Image.fromarray(np.uint8(yy <= 44 * density) * 255)
        socket = f.rectangle(normal, (48, 34, 71, 57))
        legs = clip(normal, Image.fromarray(255 - np.array(socket.getchannel('A').point(lambda v: 255 if v else 0))))
        socket_ground = ground_plane(socket)
        # Initial coin is a complete local top plate, transformed around its
        # own fixed central mount. It is not a scaled full pedestal.
        plate = f.rectangle(normal, (48, 34, 70, 42))
        coin = project_part(f, plate, [(48, 34), (70, 34), (70, 42), (48, 42)],
                            [(55, 53), (64, 53), (64, 58), (55, 58)])
        for n in range(body['visibleFrames']):
            f.put(body, n, f.snow(body, n, normal if n == 0 else damaged),
                  'Fixed neutral pedestal normal/damaged key; owner-bearing rotating turret is a separate required 2x/4x component')
        for n in range(build['visibleFrames']):
            if n == 0:
                image = coin.copy()
            else:
                image = legs.copy()
                image.alpha_composite(clip(f.translate(socket, dy=max(0, 2 - n) * 8), socket_ground))
                if n >= 2:
                    # Native assembly emerges through the mount, then pitches
                    # its two complete barrels around their individual sockets.
                    receiver_dy = {2: 17, 3: 9, 4: 2}.get(n, 0)
                    t = np.clip((n - 6) / 6, 0, 1)
                    assembly = f.blank()
                    if n >= 3:
                        q = np.array(rear_quad) * (1 - t) + np.array(rear_low) * t
                        part = project_registered_master(f, high_source, high_registration, rear_quad, q)
                        assembly.alpha_composite(f.translate(part, dy=max(0, 6 - n) * 7))
                    assembly.alpha_composite(f.translate(receiver, dy=receiver_dy))
                    if n >= 3:
                        q = np.array(front_quad) * (1 - t) + np.array(front_low) * t
                        part = project_registered_master(f, high_source, high_registration, front_quad, q)
                        assembly.alpha_composite(f.translate(part, dy=max(0, 6 - n) * 7))
                    image.alpha_composite(clip(f.translate(assembly,dx=mount_delta[0],dy=mount_delta[1]), mount_plane))
                if n >= 10:
                    image = normal.copy()
                    if 'assemblyCompletionFrame' not in turret_manifest:
                        image.alpha_composite(gun)
            f.put(build, n, f.snow(build, n, image),
                  'Fixed mount; barrels pitch about the receiver; final three native-sized slots use the pedestal with the full registered live turret child, avoiding a raised receiver clipped by the original shrinking construction buffers')
        f.export()
