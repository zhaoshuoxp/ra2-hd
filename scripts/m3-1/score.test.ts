import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignRanking, scoreText, scoreTime } from '../../src/gui/campaign/CampaignScoreModel';
import { retailMember } from '../test-support/resources';
import { ShpFile } from '../../src/data/ShpFile';

const definition = new CampaignDefinition('ra2', 'sov01t.map', readFileSync('.local/campaign/ra2/sov01t/sov01t.map', 'utf8'));

test('source ranking changes at the original Normal par boundary, independently of combat score', () => {
    expect(campaignRanking(definition, 'normal', 899)).toEqual({ parSeconds: 900,
        title: 'GUI:ParTitleSov02', message: 'GUI:UnderParMsgSov01' });
    expect(campaignRanking(definition, 'normal', 900)).toEqual({ parSeconds: 900,
        title: 'GUI:ParTitleSov01', message: 'GUI:OverParMsgSov01' });
    expect(campaignRanking(definition, 'easy', 0).parSeconds).toBe(1500);
    expect(campaignRanking(definition, 'hard', 0).parSeconds).toBe(360);
});

test('typewriter preserves complete Unicode characters and the original three-field time format', () => {
    expect(scoreText('A\u{1f31f}B', 99, 100)).toBe('');
    expect(scoreText('A\u{1f31f}B', 164, 100)).toBe('A\u{1f31f}');
    expect(scoreTime(900)).toBe('00:15:00'); expect(scoreTime(3661.9)).toBe('01:01:01');
});

test('campaign score pins the single-player panel, all source frames and its own palette', () => {
    const contract = JSON.parse(readFileSync('.local/campaign/ra2/sov01t/score-presentation.json', 'utf8'));
    for (const source of contract.sources) expect(retailMember('ra2', source.name).sha256).toBe(source.sha256);
    const sprite = new ShpFile(retailMember('ra2', contract.sprites.emblem.image).file);
    expect([sprite.width, sprite.height, sprite.numImages]).toEqual([424, 230, 44]);
    expect(new Set(sprite.images.map(frame => Buffer.from(frame.imageData).toString('base64'))).size).toBe(44);
    expect(contract.panel.openingFrames).toEqual([5, 4, 3, 2, 1, 0]);
    expect(contract.palette).toBe('sscore.pal');
});
