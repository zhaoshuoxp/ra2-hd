// Authored vector cursors use the retail 55x43 canvas and unchanged native indices.
// Sampling density is independent of CSS size and the pointer hotspot.
export function targetCursorFamily(frame: number): { name: string; phase: number; count: number } | undefined {
    for (const [name, start, count] of [['nuke', 319, 10], ['iron', 346, 5], ['chrono', 357, 12], ['storm', 279, 20]] as const) {
        if (frame >= start && frame < start + count) return { name, phase: frame - start, count };
    }
}

export function drawHdTargetCursor(ctx: CanvasRenderingContext2D, frame: number): boolean {
    const family = targetCursorFamily(frame);
    if (!family) return false;
    const pulse = (1 + Math.sin(family.phase / family.count * Math.PI * 2)) / 2;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const ellipse = (x: number, y: number, rx: number, ry: number, fill: string, stroke?: string) => {
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = fill; ctx.fill();
        if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    };
    if (family.name === 'nuke') {
        ctx.translate(28, 21); ctx.scale(1, 0.74);
        const gold = ctx.createRadialGradient(-5, -6, 1, 0, 0, 15);
        gold.addColorStop(0, '#fff080'); gold.addColorStop(1, '#ba8500');
        ctx.fillStyle = gold; ctx.strokeStyle = '#654600'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 14.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#15140b';
        for (let i = 0; i < 3; i++) {
            const angle = -Math.PI / 2 + i * Math.PI * 2 / 3;
            ctx.beginPath(); ctx.arc(0, 0, 13, angle, angle + Math.PI / 3);
            ctx.arc(0, 0, 4.5, angle + Math.PI / 3, angle, true); ctx.closePath(); ctx.fill();
        }
        ellipse(0, 0, 2.7, 2.7, `rgb(${210 + pulse * 40},${160 + pulse * 40},20)`, '#473600');
    } else if (family.name === 'iron') {
        ctx.translate(28, 21); ctx.scale(1, 0.76);
        for (let i = 0; i < 5; i++) {
            const radius = 2 + ((i + family.phase / family.count) % 5) * 3;
            ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.lineWidth = 2.4; ctx.strokeStyle = '#390608'; ctx.stroke();
            ctx.lineWidth = 1.15; ctx.strokeStyle = '#fa2425'; ctx.stroke();
        }
    } else if (family.name === 'chrono') {
        ctx.lineWidth = 1.2;
        ellipse(28, 10, 4, 3, '#183343', '#b9d4df');
        const blue = ctx.createRadialGradient(24, 20, 1, 28, 24, 13);
        blue.addColorStop(0, '#edfdff'); blue.addColorStop(.55, '#81dfff'); blue.addColorStop(1, '#126bb4');
        ellipse(28, 24, 13.5, 11.5, '#263a49', '#bfd4dd');
        ctx.fillStyle = blue; ctx.beginPath(); ctx.ellipse(28, 24, 11, 9.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#163748'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(28, 24); ctx.lineTo(28, 18); ctx.stroke();
        const angle = family.phase / family.count * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(28, 24); ctx.lineTo(28 + Math.cos(angle) * 7, 24 + Math.sin(angle) * 6); ctx.stroke();
        ellipse(28, 24, 1, 1, '#163748');
    } else {
        // Rounded shaded lobes and the native storm cycle, not a resized bitmap.
        for (const [x, y, r] of [[20, 16, 8], [28, 12, 8], [35, 15, 8], [39, 19, 5], [24, 20, 9]]) {
            const cloud = ctx.createRadialGradient(x - 2, y - 3, 0, x, y, r);
            cloud.addColorStop(0, '#9b9ca1'); cloud.addColorStop(.65, '#717278'); cloud.addColorStop(1, '#3e424b00');
            ctx.fillStyle = cloud; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        if (family.phase >= 5 && family.phase <= 14) {
            ctx.beginPath(); ctx.moveTo(29, 19); ctx.lineTo(23, 28); ctx.lineTo(28, 27); ctx.lineTo(25, 34);
            ctx.strokeStyle = '#708cff'; ctx.lineWidth = 3; ctx.stroke();
            ctx.strokeStyle = '#effbff'; ctx.lineWidth = 1.1; ctx.stroke();
        }
    }
    ctx.restore();
    return true;
}
