const focus = '<rect x="344" y="51" width="300" height="299"/>';

// Extract the editable SVG's existing subjects, leaving the full world map behind.
export function campaignLoadingForeground(svg: string): string {
    const images = svg.match(/<image\b[^>]*\/>/g) ?? [];
    const paths: string[] = svg.match(/<path\b[^>]*\/>/g) ?? [];
    const contours = paths.filter(path => path.includes('fill-rule="evenodd"'));
    const photoClip = svg.match(/<defs>[\s\S]*?<\/defs>/)?.[0];
    if (images.length !== 6 || contours.length < 100 || !photoClip) throw Error('campaign-loading-layer-contract');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1040" viewBox="0 0 800 520">'
        + photoClip + `<defs><clipPath id="mission-focus">${focus}</clipPath></defs>`
        + `<g clip-path="url(#mission-focus)">${images[0]}${contours.join('')}</g>`
        + '<path d="M634 174H716V266M234 414H542" fill="none" stroke="#ff4900" stroke-width="14"/>'
        + images.slice(1, 5).join('')
        + '<rect x="347" y="54" width="287" height="286" fill="none" stroke="#ff5900" stroke-width="4"/>'
        + '<path d="M347 54L247 144V177L347 340M247 144H281V177H247" fill="none" stroke="#ff5900" stroke-width="1.7"/>'
        + images[5] + '</svg>';
}

// Original mode retains the retail subjects and their original pixels, without its second world map.
export function originalLoadingForeground(frame: ImageData): ImageData {
    const source = document.createElement('canvas'), target = document.createElement('canvas');
    source.width = target.width = frame.width; source.height = target.height = frame.height;
    source.getContext('2d', { willReadFrequently: true })!.putImageData(frame, 0, 0);
    const context = target.getContext('2d', { willReadFrequently: true })!;
    const subjects = new Path2D('M344 51h300v299H344Z M247 144h34v33h-34Z '
        + 'M28 300h207v199H28Z M252 378h79v64h-79Z M349 378h79v64h-79Z M443 377h80v65h-80Z '
        + 'M637 266H780V508H542V342H637Z M627 167H723V273H709V181H627Z M234 407H542V421H234Z');
    context.save(); context.clip(subjects); context.drawImage(source, 0, 0); context.restore();
    context.strokeStyle = '#ff5900'; context.lineWidth = 1.7;
    context.stroke(new Path2D('M347 54L247 144V177L347 340M247 144H281V177H247'));
    const result = context.getImageData(0, 0, frame.width, frame.height);
    source.width = source.height = target.width = target.height = 0;
    return result;
}
