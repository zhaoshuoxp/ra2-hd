import React from 'react';

export function CampaignLaunchTransition({ strings }: { strings: any }) {
    return <section data-campaign-starting aria-label={strings.get('HD:CampaignStarting')}
        style={{ width: '100%', height: '100%', background: '#000' }} />;
}
