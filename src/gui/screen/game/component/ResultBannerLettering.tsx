import React, { useId } from 'react';

export const resultLetteringRevision = 'R5';

export function ResultBannerLettering({ victory, text, mission = false }: {
    victory: boolean;
    text: string;
    mission?: boolean;
}) {
    const id = `result-lettering-${useId().replace(/:/g, '')}`;
    const latin = !/\p{Script=Han}/u.test(text);
    // Match the source's bright yellow face, orange foot and lower-right shadow.
    const colors = mission
        ? ['#fcfc10', '#fcec10', '#fcc400', '#fcb400', '#fc9800']
        : ['#fcec44', '#fcd824', '#fcb420', '#fc9810', '#fc7800'];
    return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 436 112" aria-hidden="true" data-result-lettering="retail-gold-r5"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
            <linearGradient id={`${id}-gold`} x1="0%" y1="0%" x2="0%" y2="100%" colorInterpolation="sRGB">
                {colors.map((color, index) => <stop key={index} offset={`${index * 25}%`} stopColor={color}/>)}
            </linearGradient>
            <filter id={`${id}-shadow`} x="-10%" y="-25%" width="120%" height="160%"
                colorInterpolationFilters="sRGB">
                <feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="shadow-spread"/>
                <feGaussianBlur in="shadow-spread" stdDeviation="1.4" result="shadow-soft"/>
                <feOffset in="shadow-soft" dx="1.5" dy="1.5" result="shadow-offset"/>
                <feFlood floodColor="#484438" floodOpacity="1" result="shadow-color"/>
                <feComposite in="shadow-color" in2="shadow-offset" operator="in" result="shadow"/>
                <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <text x="218" y={victory ? 48 : 94} textAnchor="middle" fill={`url(#${id}-gold)`}
            stroke="#303024" strokeWidth="0.65" paintOrder="stroke" fontSize={latin ? 34 : 46}
            fontFamily={latin ? 'Arial, sans-serif' : '"Heiti TC", "Heiti SC", "Microsoft JhengHei", "Microsoft YaHei", sans-serif'}
            fontWeight="400" filter={`url(#${id}-shadow)`}>{text}</text>
    </svg>;
}
