"""Continuous curved canopy with one advancing mouth and one pair of pipes."""
import argparse
import copy
import shutil
from pathlib import Path
from importlib.machinery import SourceFileLoader
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label, map_coordinates
from buildup import read, sha, write
from painted_rig import over, place, project_rgba

prior = SourceFileLoader('telescope_prior', 'scripts/art/author-yuri-factory-followup.py').load_module()
terminal, fraction = prior.terminal, prior.fraction
ROOT = prior.prior.ROOT
BATCH = ROOT/'yuri-telescope-r116-v1'
PREVIOUS = ROOT/'yuri-factory-followup-r115-v1'


class Scene(prior.Scene):
    def __init__(self, record, output, source):
        super().__init__(record, output, source)
        self.previous = read(PREVIOUS/'rigs-v7/rigs.json')[record['key']]
        self.setup_canopy()

    def setup_canopy(self):
        file = BATCH/'continuous-steel-skin-v3.png'
        image = np.array(Image.open(file).convert('RGBA'))
        ids, _ = label(image[...,3] >= 230)
        sizes = np.bincount(ids.ravel()); sizes[0] = 0
        image[ids != sizes.argmax()] = 0
        image[...,3][image[...,3] >= 230] = 255
        sy, sx = np.mgrid[:image.shape[0], :image.shape[1]]
        curve_x = np.array([873,920,970,1020,1070,1120,1170,1220,1270,1320,1370,1400],float)
        curve_y = np.array([778,714,660,615,580,554,532,516,506,505,518,539],float)
        axis_k = 725/390
        front_x = np.interp(sx-axis_k*sy, curve_x-axis_k*curve_y, curve_x)
        longitudinal = (sx-front_x)/725
        coverage = (longitudinal <= .012) & (longitudinal >= -1.3) & (sx-axis_k*sy >= -920)
        image[~coverage] = 0
        # One registration for the complete open canopy. Only thin roof/pipe
        # courses move; there are no repeated arch walls or interior floors.
        source = np.array([[873,778,1],[1400,539,1],[148,388,1]],float)
        target = np.array([[165,173],[198,153],[100,147]],float)
        matrix = np.linalg.solve(source,target).T
        self.full_master = np.array(Image.open(file).convert('RGBA'))
        inverse = np.linalg.inv(np.vstack([matrix,[0,0,1]]))
        sxw = inverse[0,0]*self.xx+inverse[0,1]*self.yy+inverse[0,2]
        syw = inverse[1,0]*self.xx+inverse[1,1]*self.yy+inverse[1,2]
        front = np.interp(sxw-axis_k*syw,curve_x-axis_k*curve_y,curve_x)
        t = (sxw-front)/725
        self.course_ids = np.clip(np.floor((t+1)*4).astype(int),0,3)
        self.canopy = project_rgba(Image.fromarray(image),matrix,self.rig.canvas)
        local = np.clip((t+1)*4-self.course_ids,0,1)
        edge = np.where(local[...,None]>.965,.55,1)
        self.canopy[...,:3] = np.rint(self.canopy[...,:3]*edge).astype('uint8')
        self.plate_bolts = []
        centers = [[(111,149),(123,140),(144,131)],[(124,155),(137,147),(158,137)],
                   [(138,162),(152,154),(172,144)],[(151,169),(166,161),(187,151)]]
        for row in centers:
            mask = np.zeros(self.xx.shape,bool)
            for bx,by in row:mask |= (np.abs(self.xx-bx)<=2.5)&(np.abs(self.yy-by)<=2.2)
            self.plate_bolts.append(terminal.masked(self.full,mask))
        self.roof_slope = 26/65
        mast = self.region([(109,66),(141,66),(144,109),(172,135),(169,146),(127,124),(101,142),(97,137),(119,116)])
        self.curve_x = curve_x
        self.curve_y = curve_y
        self.curve_v = curve_x-axis_k*curve_y
        self.native_matrix = matrix
        self.axis_k = axis_k
        cap_file = BATCH/'continuous-canopy-v1.png'
        cap_master = np.array(Image.open(cap_file).convert('RGBA'))
        cap_points = [(901,493),(910,465),(930,438),(963,423),(1008,420),(1056,426),
                      (1101,441),(1132,470),(1150,494),(1152,517),(1140,538),
                      (1107,555),(1066,565),(1017,565),(971,554),(930,536),(909,515)]
        cap_layer = Image.new('L',cap_master.shape[1::-1])
        ImageDraw.Draw(cap_layer).polygon(cap_points,fill=255)
        cap_coverage = np.array(cap_layer)
        cap_master[...,3] = np.minimum(cap_master[...,3],cap_coverage)
        cap_matrix = np.array([[19/256,0,165-900*19/256],
                               [0,12/150,148.5-420*12/150]])
        self.cap = project_rgba(Image.fromarray(cap_master),cap_matrix,self.rig.canvas)
        self.tip_mask = mast & (self.yy<104.5) & (self.xx>108) & (self.xx<143)
        self.head_mask = self.region([(114,103),(136,103),(137,123),(116,126),(112,117)])
        self.head = terminal.masked(self.full,self.head_mask)
        beams = self.region([(98,154),(103,153),(124,132),(126,126),(130,130),(129,134),(104,160)])
        beams = beams | self.region([(123,118),(126,117),(130,120),(157,111),
                                     (164,113),(165,119),(131,131),(124,126)])
        u = np.clip(((self.xx-125)*64+(self.yy-122)*34)/(64**2+34**2),0,1)
        beams |= (self.xx-125-64*u)**2+(self.yy-122-34*u)**2<=2.1**2
        self.beams = terminal.masked(self.full,beams & ~self.tip_mask & ~self.head_mask)
        self.mast_mask = beams | self.tip_mask | self.head_mask
        self.front_face = self.make_front_face()
        self.source['continuousCanopy'] = {'file':str(file),'sha256':sha(file),'prompt':str(BATCH/'continuous-steel-skin-v3.prompt.txt'),'generationTool':'BUILTIN_IMAGEGEN'}
        self.canopy_registration = {'sourceAnchors':source.tolist(),'nativeAnchors':target.tolist(),'matrix':matrix.tolist(),'courseCount':4,'mouthCount':1,'pipeRows':2}

    def make_front_face(self):
        # The mouth shares the roof's exact traced curve; its side walls fall
        # to one lower threshold. A single face is translated during buildup.
        q=np.clip((self.xx-165)/33,0,1)
        for _ in range(5):
            sx=873+527*q
            cy=np.interp(sx,self.curve_x,self.curve_y)
            top_x=self.native_matrix[0,0]*sx+self.native_matrix[0,1]*cy+self.native_matrix[0,2]
            top_y=self.native_matrix[1,0]*sx+self.native_matrix[1,1]*cy+self.native_matrix[1,2]
            bottom_y=189-17*q
            depth=(self.yy-top_y)/np.maximum(1,bottom_y-top_y)
            model_x=(1-depth)*top_x+depth*(165+33*q)
            q+=(self.xx-model_x)/33
        sx=873+527*q
        cy=np.interp(sx,self.curve_x,self.curve_y)
        top_y=self.native_matrix[1,0]*sx+self.native_matrix[1,1]*cy+self.native_matrix[1,2]
        depth=(self.yy-top_y)/np.maximum(1,189-17*q-top_y)
        floor_y=943+(sx-873)*(705-943)/(1400-873)
        sy=cy+depth*(floor_y-cy)
        rgba=np.stack([map_coordinates(self.full_master[...,c].astype(float),[sy,sx],order=1,mode='constant',cval=0) for c in range(4)],axis=-1)
        keep=(q>=0)&(q<=1)&(depth>=0)&(depth<=1)
        rgba[~keep]=0
        return np.clip(np.rint(rgba),0,255).astype('uint8')

    def moving_canopy(self,nodes,p):
        xtrack=[0,0,0,0,108,108,109,109,110,111,112,114,116,119,122,125,128,132,137,144,151,158,163,165,165]
        ytrack=[0,0,0,0,169,163,158,154,151,150,150,151,152,153,154,155,156,157,159,162,165,168,171,173,173]
        dx=xtrack[p]-165
        lift=ytrack[p]-173-self.roof_slope*dx
        face=terminal.move(self.front_face,dx=dx,dy=ytrack[p]-173)
        if p<9:face=terminal.masked(face,self.yy<=-.5*self.xx+220)
        self.draw(nodes,face,'single-advancing-dark-mouth',p,'ONE_COMPLETE_MOUTH_SHARES_TRACED_CANOPY_CURVE')
        for i in reversed(range(4)):
            travel=dx*i/3
            part=terminal.masked(self.canopy,self.course_ids==i)
            part=over(self.plate_bolts[i],part)
            moving=terminal.move(part,dx=travel,dy=self.roof_slope*travel+lift)
            if p<9:moving=terminal.masked(moving,self.yy<=-.5*self.xx+220)
            self.draw(nodes,moving,'continuous-roof-course-'+str(i),p,'THIN_CURVED_ROOF_AND_SHARED_PIPE_COURSE_WITHOUT_DUPLICATE_MOUTH',course=i,travel=[travel,self.roof_slope*travel+lift])
        cap_x=[0,0,0,0,120,120,120,121,122,122,122,123,125,127,130,133,136,140.5,146,151,157,163,169,174,174.5]
        cap_y=[0,0,0,0,155,148,143,139,134,132,132,133,133,135,136,138,140,142,144,146,148,151,153,154,155]
        cap=terminal.move(self.cap,dx=cap_x[p]-174.5,dy=cap_y[p]-155)
        if p<9:cap=terminal.masked(cap,self.yy<=-.5*self.xx+220)
        self.draw(nodes,cap,'single-tracked-roof-cap',p,'ONE_RETAINED_ROOF_CAP_FOLLOWS_ORIGINAL_PHASE_TRACK')

    def mast_pose(self,nodes,p):
        if p<15:return
        native_x=[104,106,108,110,112,114,116,118,118,118][p-15]
        native_y=[128,123,119,115,111,107,105,104,104,104][p-15]
        head=terminal.masked(self.head,self.yy<=115+8*fraction(p,17,22))
        self.draw(nodes,terminal.move(head,dx=native_x+5-124,dy=native_y+3-108),'tracked-piston-head',p,'FLAT_PISTON_HEAD_PRECEDES_LATE_ANTENNA_EXTENSION')
        drop=46*(1-fraction(p,15,23))
        beams=terminal.masked(terminal.move(self.beams,dy=drop),self.yy<=142+20*fraction(p,19,23))
        self.draw(nodes,beams,'separate-rear-cross-beams',p,'RETAINED_BEAMS_SEPARATE_FROM_PISTON_AND_LATE_TIPS')
        if p>=22:
            tip_drop={22:27,23:13,24:0}[p]
            tips=terminal.masked(terminal.move(terminal.masked(self.full,self.tip_mask),dy=tip_drop),self.yy<=108)
            self.draw(nodes,tips,'late-mast-tips',p,'TRIDENT_TIPS_EXTEND_ONLY_AFTER_PISTON_HEAD',drop=tip_drop)


def factory(s):
    removed=('whole-vault-','whole-telescoping-vault-','whole-front-vault-','whole-gold-roof-cap')
    for p,previous in enumerate(s.previous['phases']):
        if p==24:
            s.phases.append(copy.deepcopy(previous));continue
        if p==23:
            nodes=[]
            s.draw(nodes,terminal.masked(s.full,~s.mast_mask),'complete-body-before-last-tips',p,'EXACT_RETAINED_COMPLETE_BODY')
            s.mast_pose(nodes,p);s.phases.append(nodes);continue
        if p==22:previous=s.previous['phases'][21]
        nodes=[];inserted=False
        for node in previous:
            name=node['name']
            if name.startswith(removed):
                if not inserted:s.moving_canopy(nodes,p);inserted=True
                continue
            if name=='rear-antenna-and-cross-beams':
                s.mast_pose(nodes,p);continue
            if name=='connected-near-wall-and-pipes':
                layer=place(Image.open(node['image']),node['box'],s.rig.canvas)
                front_x=[0,0,0,0,108,108,109,109,110,111,112,114,116,119,122,125,128,132,137,144,151,159,167,175,175][p]
                layer=terminal.masked(layer,(s.yy>=.43*s.xx+112)&(s.xx<=front_x))
                s.draw(nodes,layer,'lower-chassis-without-duplicate-pipes',p,'KEEP_LOWER_CHASSIS_BELOW_SINGLE_MOVING_PIPE_BANK')
                continue
            nodes.append(copy.deepcopy(node))
        if p>=4 and not inserted:raise AssertionError('Canopy insertion missing')
        s.phases.append(nodes)
    result=s.finish()
    result['originalPhaseReconstruction'].update(source=str(BATCH),roofCourseGeometry='CONTINUOUS_CURVED_SHEET_COURSES_ONE_MOUTH_TWO_PIPE_ROWS',referenceOriginalPhase=17,registration=s.canopy_registration)
    result['newSourceProvenance']=s.source
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    parser.add_argument('--theater',default='')
    args=parser.parse_args();args.output.mkdir(exist_ok=False)
    source=args.output/'authoring-source.py';shutil.copy2(__file__,source)
    rigs={}
    for rec in read(PREVIOUS/'selected-v2/authoring.json')['families']:
        if rec['identity']!='YAWEAP' or (args.theater and rec['theater']!=args.theater):continue
        scene=Scene(rec,args.output/rec['key'],source);rigs[rec['key']]=factory(scene);print(rec['key'],'complete',flush=True)
    write(args.output/'rigs.json',rigs)
if __name__=='__main__':main()
