import React from 'react';

export function CampaignObjectives({ title, text }: { title: string; text: string }) {
    return <section data-campaign-objectives style={{ boxSizing: 'border-box', height: '100%',
        overflowY: 'auto', padding: '24px 28px', color: '#fffbdc', textShadow: '1px 1px #000' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 28 }}>{title}</h2>
        <div style={{ whiteSpace: 'pre-line', fontSize: 20, lineHeight: 1.5 }}>{text}</div>
    </section>;
}
