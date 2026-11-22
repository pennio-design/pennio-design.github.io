"""Synthesises sung test voices with known tempo, downbeat, key, mode, swing and grid, for scripts/voice-match/bench.js.
Run from this folder: python3 synth_voices.py  (needs numpy). Writes voices/*.wav and voices/truth.json."""
import os, numpy as np, json, wave, random
os.makedirs('voices',exist_ok=True)
SR=44100
MAJ=[0,2,4,5,7,9,11]; MIN=[0,2,3,5,7,8,10]
PROGS={'minor':[0,5,2,6],'major':[0,4,5,3]}
def mtof(m): return 440*2**((m-69)/12)
def note(sig,t0,dur,f,rng,amp=.5):
    n=int(dur*SR); t=np.arange(n)/SR
    vib=1+0.007*np.sin(2*np.pi*5.5*t)*np.clip(t/.15,0,1)
    port=np.exp(-t/.04)*0.03   # slight scoop into the note
    ph=2*np.pi*np.cumsum(f*(1+port)*vib)/SR
    y=np.zeros(n)
    for h in range(1,14):
        fh=f*h
        form=np.exp(-((fh-600)/500)**2)+.6*np.exp(-((fh-1700)/700)**2)+.25*np.exp(-((fh-3000)/900)**2)
        y+=np.sin(h*ph)*(1/h**1.05)*(.25+form)
    env=np.minimum(1,t/.02)*np.exp(-t/(dur*3))   # soft attack, gentle decay
    rel=np.minimum(1,(dur-t)/.06); env*=np.clip(rel,0,1)
    y=y*env
    # consonant burst at the onset
    nb=int(.03*SR); burst=rng.normal(0,1,nb)*np.hanning(nb)*.5
    y[:nb]+=burst[:min(nb,n)]
    i0=int(t0*SR); sig[i0:i0+n]+=amp*y[:max(0,len(sig)-i0)][:n] if i0+n<=len(sig) else amp*y[:len(sig)-i0]
def make(name,bpm,key,mode,swing,grid,seed,bars=8,lead=0.9):
    rng=np.random.default_rng(seed); r=random.Random(seed)
    beat=60/bpm; steps=16 if grid==16 else 12; per_beat=steps//4
    step=beat/per_beat
    scale=MAJ if mode=='major' else MIN
    prog=PROGS[mode]
    sig=np.zeros(int((lead+bars*4*beat+1.5)*SR))
    onsets=[]
    # rhythm: syncopated vocal phrase, each bar picks 4-7 onsets, strong on 0 and beat positions
    for b in range(bars):
        chord=prog[b%len(prog)]
        tones=[scale[(chord+k)%7] for k in (0,2,4)]
        cand=list(range(steps))
        w=[3.0 if s==0 else 2.0 if s%per_beat==0 else 1.2 if s%(per_beat//2 or 1)==0 else .6 for s in cand]
        k=r.randint(4,7)
        pick=set([0]) if b%2==0 else set()
        while len(pick)<k: pick.add(r.choices(cand,weights=w)[0])
        pick=sorted(pick)
        for j,s in enumerate(pick):
            nxt=pick[j+1] if j+1<len(pick) else steps
            dur=max(.12,(nxt-s)*step*.85)
            off=(step*swing/100*.5) if (grid==16 and s%2==1) else 0
            t0=lead+(b*steps+s)*step+off
            deg=r.choice([0,0,1,2,2,4,4,5])
            pc=(key+(tones[(deg%3)] if r.random()<.7 else scale[r.randrange(7)]))%12
            midi=60+((pc-60)%12) if pc>=5 else 72+pc-12+12  # keep roughly 60-76
            midi=int(60+((pc-0)%12)+ (12 if pc<5 else 0))
            note(sig,t0,dur,mtof(midi),rng)
            onsets.append(t0)
    sig+=rng.normal(0,.0015,len(sig))
    sig/=np.max(np.abs(sig))*1.1
    pcm=(sig*32767).astype(np.int16)
    with wave.open(f'voices/{name}.wav','wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes(pcm.tobytes())
    return {'name':name,'bpm':bpm,'downbeat':lead,'key':key,'mode':mode,'swing':swing,'grid':grid,'seconds':len(sig)/SR,'onsets':onsets}
cases=[
 ('f_min_101',101,5,'minor',14,16,1),('a_min_88',88,9,'minor',0,16,2),('d_maj_112',112,2,'major',20,16,3),
 ('g_maj_124',124,7,'major',6,16,4),('c_min_96',96,0,'minor',30,16,5),('eb_maj_104',104,3,'major',10,16,6),
 ('bb_min_118',118,10,'minor',0,16,7),('e_min_92',92,4,'minor',24,16,8),('a_maj_108',108,9,'major',14,16,9),
 ('d_min_112_tri',112,2,'minor',0,12,10),('g_maj_96_tri',96,7,'major',0,12,11),('f_min_84',84,5,'minor',12,16,12),
]
truth=[make(*c) for c in cases]
json.dump(truth,open('voices/truth.json','w'),indent=1)
print(len(truth),'voices;', ', '.join(f"{t['name']} {t['seconds']:.0f}s" for t in truth[:3]),'...')
