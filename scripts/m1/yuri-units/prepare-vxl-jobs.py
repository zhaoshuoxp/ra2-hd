"""Prepare native-part-specific built-in image generation inputs."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / '.artifacts/yuri-units'
WORKLIST = BASE / 'vxl-production-v1/worklist.json'

DETAILS = {
    'LTNK-ltnk-DUMMY01': 'ONLY the low tracked chassis: worn warm olive and ivory sloped deck, black continuous tracks, modest red corner armor plates and central turret mounting ring. No turret, gun barrel or complete assembled tank.',
    'LTNK-ltnktur-DUMMY01': 'ONLY the olive angular tank turret WITH its long olive main gun, which belongs to this native section. Preserve the pale top plate, gray rear mechanism and short mounting stem. Gun points upper-right, up, upper-left, left / lower-left, down, lower-right, right respectively. No tracks or chassis. Do not shorten the main gun into a stub.',
    'LTNK-ltnkbarl-DUMMY01': 'ONLY the very SHORT neutral blue-gray rectangular rod or sleeve actually visible in image1. Despite the component name this is NOT the long olive main gun. Preserve its small rectangular proportions, diagonal or end-on projection per cell. No turret, chassis, long gun, muzzle blast or red paint.',
    'YHVR-yhvr-DUMMY01': 'Low olive and ivory hover transport with red deck plates, black rubber skirt, two LARGE raised round olive propulsion fan pods at the REAR and two dark flat circular hatches on the front deck. Retain the precise source nose/rear orientation in each cell. No turret, weapons, tracks, wheels or additional fans.',
    'PCV-pcv-DUMMY01': 'Long heavy tracked mobile construction vehicle. Preserve the exact unusually long ivory/olive chassis, raised rounded olive front machinery housing and prominent mid-body gray mechanical doors, red armor accents, THREE short separate tracked bogie units with small wheel rows on EACH SIDE, with visible gaps between bogies, and narrow fork-like protrusion at the nose. The protrusion is not a gun. No unfolded building, cranes, added turret or generic truck replacement. Closely follow these TWO source projections.',
    'SMIN-smin-DUMMY01': 'ONLY mobile slave miner chassis. Paired black continuous tracks, low front steps, tall rear olive machinery housing with vent and door, and FOUR tall dark gray cylindrical open bins arranged two by two, with thick red rings around hollow mouths. All four tubes belong to this chassis and are not red solid missiles. Retain the source turret socket at the rear but do not add a machine gun or turret.',
    'SMIN-smintur-DUMMY01': 'ONLY the small separate olive angular gun turret, short dark machine gun and compact round mounting stem. Match native gun direction and foreshortening in every cell. No red-painted bins, cylinders, miner chassis, tracks or human worker. Original part has neutral olive and dark steel materials.',
    'YTNK-ytnk-DUMMY01': 'ONLY small low FOUR-WHEELED olive and ivory gattling vehicle chassis with modest red corner mudguards and central raised mechanical mounting deck. Preserve four black tires and source wheel occlusion. No tracks, gun barrels, turret or assembled tank.',
    'YTNK-ytnktur-CYLINDER14': 'ONLY this ONE slim olive and dark-steel segmented gun barrel component, not a pair. Preserve each source projection including the severely foreshortened almost end-on view in cell6. Source directions upper-right, up, upper-left, left / short lower-left, short downward end-on, short lower-right, right. No red paint, turret housing, chassis, extra gun or effects.',
    'YTNK-ytnktur-CYLINDER22': 'ONLY this ONE independent slim olive and dark-steel segmented gun barrel component, not a pair. Follow this specific section source rather than copying a neighboring barrel. Preserve severely foreshortened cell6 and all source directions and lengths. No red paint, turret housing, chassis, added gun or effects.',
    'YTNK-ytnktur-DUMMY01': 'ONLY the central small rounded olive gun pod with small red top cap, lateral open framework and rear socket mounting mechanism. Preserve the source silhouette from each angle. No long gun barrels, wheels, chassis or complete vehicle.',
    'TELE-tele-DUMMY01': 'ONLY the low olive and ivory tracked chassis with white fender deck plates, red armor rectangles, small raised central turret socket and two narrow front lower rails or forks. These chassis projections contain no separate twin-prong weapon turret. Match source angular hull and front/rear direction. No added turret, large gun or complete assembled tank.',
    'TELE-teletur-DUMMY01': 'ONLY the small separate psychic weapon turret: central curved dark olive/gray housing, TWO short silver-blue fork/prong rods, paired red coil housings beside the prongs, and dark rounded mounting stem. Preserve twin prong spacing and exact direction per cell. No chassis, tracks, whole tank or long conventional gun.',
    'CAOS-caos-DUMMY01': 'Small squat FOUR-WHEEL robotic drone with separated olive/ivory wheel arms, four black tires, round pale olive central dome, and RED rectangular lobes arranged around that dome. Retain the compact source silhouette and tire occlusion. No tracks, tank hull, gun, exaggerated glowing effects or additional machinery.',
    'BSUB-bsub-DUMMY01': 'Boomer submarine with long twin rounded olive/ivory lower hulls, narrow center deck, a line of gray circular missile hatch covers, pointed red central bow cover, small red-gray front housing, larger rear red-gray conning tower and thin periscopes, broad swept triangular stern fins with red tips. Match exact source bow/stern direction in every cell, including end-on cells2 and6. Use accepted material guide but keep native geometry and component counts. No ocean, wake, missiles launching, waterline, shadows or ground.',
    'CMISL-bsubmisl-DUMMY01': 'ONLY a narrow white and light-gray submarine missile with a small red pointed nose and red tail fins. Match native horizontal flying pose from eight headings and foreshortening. Nose direction upper-right, up, upper-left, left / lower-left, down, lower-right, right. No submarine hull, fire trail, launch plume, floor, vertical standing rocket or warhead enlargement.',
    'MIND-mind-DUMMY01': 'Heavy compact tracked Master Mind vehicle. Low rectangular olive/ivory tracked base, red corner fittings, large central short gray cylindrical psychic machine with a broad red band, white upper collar, olive lid and substantial blue-gray inverted U-shaped frame over it. Rear red protrusions and front vents stay in exact source locations. No conventional gun turret, barrel, giant brain, extra antennas or fire effects.',
    'DISK-disk-DUMMY01': 'ONLY the separate underside/body of the flying disk: a shallow circular muted golden-brass metal plate seen as an isometric ellipse, raised dark olive rim, concentric panel seams and central flat circular plate. Follow the bottom-left accepted reference material. Native part is a flat disk without dome or upper equipment. No silver dome, red ring, upper ventilation ring, full UFO, lights, stand or engine glow.',
    'DISK-disktur-DUMMY01': 'ONLY the separate broad upper disk assembly: wide shallow muted brass saucer rim, ivory mechanical ventilation ring with dark blue-gray pipes, small central faceted SILVER dome, red band ONLY around the dome base, and olive vent collar. Match the source subtle orientation changes of seams and equipment across all eight headings. This upper part includes the broad saucer rim in the native model. No separate underside plate, support stand, legs, scene, floating glow or added weapons.',
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    work = json.loads(WORKLIST.read_text())
    jobs = []
    for board in work['boards']:
        bid = board['id']
        source = ROOT / board['board']
        assert sha(source) == board['boardSha256']
        style = BASE / 'representatives-v1' / {
            'SMIN': 'SMIN-raw.png', 'DISK': 'DISK-raw.png',
            'BSUB': 'BSUB-raw.png', 'CMISL': 'BSUB-raw.png',
        }.get(board['identity'], 'LTNK-raw.png')
        folder = BASE / 'vxl-production-v1/jobs' / bid
        folder.mkdir(parents=True, exist_ok=False)
        groups = [list(range(8))] if board['identity'] != 'PCV' else [list(range(i, i + 2)) for i in range(0, 8, 2)]
        for number, indices in enumerate(groups, 1):
            guide = source
            if len(groups) > 1:
                image = Image.open(source)
                column, row = indices[0] % 4, indices[0] // 4
                guide = folder / f'native-pair-{number}.png'
                image.crop((column * 512, row * 512, (column + 2) * 512, (row + 1) * 512)).save(guide)
            headings = [board['frames'][i]['heading'] for i in indices]
            grid = '4 columns and 2 rows' if len(indices) == 8 else '2 columns and a single row'
            prompt = f'''Use case: precise-object-edit, independent native game component sprites.
Image1 is the ORIGINAL native component geometry and view authority. Image2 is an approved MATERIAL AND LIGHTING reference; it must not replace image1 geometry or add other components from the complete vehicle.
Create a sharp high-resolution transparent game sprite board with exactly {grid}, {len(indices)} occupied cells, original row-major order. Source headings are {headings}. Preserve each native projection, silhouette, equipment placement, relative proportions, count and view elevation. Independently render each heading in 3D isometric perspective; do not rotate a flat illustration.
{DETAILS[bid]}
Use the accepted worn metal, defined bevels, restrained seams, fixed upper-left game lighting and realistic game sprite detail. Preserve source RED armor regions as red, neutral steel/olive/ivory parts as neutral, without inventing red paint or changing part identity. No labels or numbers, background, floor, ground shadow, dramatic lighting, scenery, additional parts or extra cells. Source green background and white text are omitted completely.
Use a wide 2:1 canvas. Each component occupies about 80 percent of its cell's longest dimension, with clean transparent gutters and safe margins containing all tips and antennae. Include large actual painted detail, sufficient for true four-times native resolution; do not return tiny parts in oversized blank cells. Return transparent RGBA artwork.'''
            if len(indices) == 2:
                prompt += '\nRender both complete large vehicles at roughly 600 or more pixels across, with all tracks and narrow protrusions entirely visible. The two source views are different camera projections of one vehicle, not two designs.'
            prompt_file = folder / f'prompt-used-{number}.txt'
            prompt_file.write_text(prompt + '\n')
            paths = [str(guide), str(style)]
            inputs_file = folder / f'generation-inputs-{number}.json'
            metadata = {'boardId': bid, 'headings': headings, 'promptFile': str(prompt_file),
                        'referencedImagePaths': paths, 'nativeBoardSha256': sha(source),
                        'referenceSha256': {p: sha(Path(p)) for p in paths},
                        'tool': 'built-in image_gen', 'runtimeActivation': False}
            inputs_file.write_text(json.dumps(metadata, indent=2) + '\n')
            jobs.append({'id': f'{bid}-{number}', 'boardId': bid, 'headings': headings,
                         'prompt': prompt, 'paths': paths, 'promptFile': str(prompt_file),
                         'inputsFile': str(inputs_file)})
    output = BASE / 'vxl-jobs-v1.json'
    assert not output.exists()
    output.write_text(json.dumps(jobs, indent=2) + '\n')
    print(json.dumps({'jobs': len(jobs), 'parts': len(work['boards']), 'headings': sum(len(j['headings']) for j in jobs), 'output': str(output)}))

if __name__ == '__main__':
    main()
