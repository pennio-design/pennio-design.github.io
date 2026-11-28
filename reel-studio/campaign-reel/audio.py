"""Synthesises the reel's soundtrack from scratch (no samples, no licensed music): an Afro-pulse groove at 100 BPM, 28.8 s, twelve bars (cut 3).
Run: python3 audio.py out.wav   (needs numpy)"""
import sys, wave, numpy as np
SR=44100; BPM=100; BEAT=60/BPM; STEP=BEAT/4; BARS=12; N=int(SR*BEAT*4*BARS)+SR
rng=np.random.default_rng(7)
mix=np.zeros(N,dtype=np.float64)
def add(sig,t,gain=1.0):
    i=int(t*SR); 
    if i>=N: return
    j=min(N,i+len(sig)); mix[i:j]+=sig[:j-i]*gain
def env(n,a=.002,d=.2):
    t=np.arange(n)/SR; return np.minimum(1,t/a)*np.exp(-t/d)
def kick():
    n=int(.3*SR); t=np.arange(n)/SR; f=45+90*np.exp(-t/.04); ph=2*np.pi*np.cumsum(f)/SR; return np.sin(ph)*np.exp(-t/.11)*1.1
def clap():
    n=int(.22*SR); x=rng.normal(0,1,n); x=np.convolve(x,np.ones(6)/6,mode='same')*0+x
    t=np.arange(n)/SR; e=(np.exp(-t/.04)+.6*np.exp(-np.maximum(0,t-.012)/.05)); hp=x-np.convolve(x,np.ones(40)/40,mode='same'); return hp*e*.5
def shk(acc):
    n=int(.07*SR); x=rng.normal(0,1,n); hp=x-np.convolve(x,np.ones(8)/8,mode='same'); return hp*np.exp(-np.arange(n)/SR/.02)*(.22 if acc else .12)
def bass(f,dur=.34):
    n=int(dur*SR); t=np.arange(n)/SR; y=np.sin(2*np.pi*f*t)+.3*np.sin(4*np.pi*f*t); return y*env(n,.004,.2)*.6*np.minimum(1,(dur-t)/.04)
def pluck(f,dur=.5):
    n=int(dur*SR); t=np.arange(n)/SR; y=sum(np.sin(2*np.pi*f*h*t)/h**1.3 for h in range(1,7)); return y*env(n,.003,.16)*.32
def sweep(t0,dur,up=True):
    n=int(dur*SR); x=rng.normal(0,1,n); k=np.linspace(0,1,n)**2; y=np.zeros(n)
    sm=np.convolve(x,np.ones(30)/30,mode='same'); y=sm*(k if up else (1-np.linspace(0,1,n))**2)*0.5; return y
def crash():
    n=int(1.1*SR); x=rng.normal(0,1,n); hp=x-np.convolve(x,np.ones(12)/12,mode='same'); return hp*np.exp(-np.arange(n)/SR/.35)*.35
A=55.0; NOTE={'a':A*2,'c':A*2*2**(3/12),'d':A*2*2**(5/12),'e':A*2*2**(7/12),'g':A*2*2**(10/12)}
bassline=[(0,1),(3,1),(6,.84),(10,1),(13,1.19)]  # steps in a bar, ratio of A1
mel=[(0,'e'),(3,'g'),(6,'a'),(8,'g'),(10,'e'),(12,'d'),(14,'c')]
for bar in range(BARS):
    t0=bar*BEAT*4
    for s in range(16):
        t=t0+s*STEP+(STEP*.12 if s%2 else 0)
        if bar>=0:
            if s%4==0 and bar!=0 or (bar==0 and s in (0,8)): add(kick(),t,.9)
            if s in (6,14) and bar>=1: add(kick(),t,.55)
        if bar>=1 and s%2==0: add(shk(s%4==2),t)
        if bar>=2 and s in (4,12): add(clap(),t,.7)
        if bar>=2 and s%1==0 and bar!=2:
            pass
    if bar>=2:
        for s,r in bassline: add(bass(A*r),t0+s*STEP,.9)
    if bar in (5,6,7,8,9,10):
        for s,n in mel: add(pluck(NOTE[n]),t0+s*STEP+(STEP*.12 if s%2 else 0),.8 if bar<10 else 1.0)
    if bar>=10:
        for s in (0,8): add(bass(A*2,.5)*.5,t0+s*STEP,.8)
add(sweep(0,2.4,True)[:int(.9*SR)],BEAT*4-0.9,.9)      # into the cards
SW=sweep(0,2.4,True)[:int(.9*SR)]
add(SW,3.6*0+11.4-0.9,.9); add(crash(),11.4,.9)      # into the line
add(SW,18.6-0.9,.6)                                  # into the steps
add(SW,24.0-0.9,.9); add(crash(),24.0,.9)            # into the close
# a soft wooden tick on every statement, so the words land on the beat
for t in (0.0,1.8,3.6,5.4,7.2,9.0,11.4,15.0,17.4,18.6,20.4,22.2,24.0):
    n=int(.09*SR); tt=np.arange(n)/SR; add(np.sin(2*np.pi*(660 if t not in (11.4,24.0) else 440)*tt)*np.exp(-tt/.02)*.3,t,.7)
fade=np.ones(N); L=int(1.2*SR); fade[int(BEAT*4*BARS*SR)-L:int(BEAT*4*BARS*SR)]=np.linspace(1,0,L); fade[int(BEAT*4*BARS*SR):]=0
mix*=fade
# gentle limiter and level
mix=np.tanh(mix*1.1)/np.tanh(1.1); mix=mix/np.max(np.abs(mix))*.8
st=np.stack([mix,mix],1)  # identical channels: plays the same on a phone speaker and encodes without a stray peak
pcm=(st[:int(BEAT*4*BARS*SR)+int(.3*SR)]*32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv)>1 else 'reel.wav','wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote',len(pcm)/SR,'s')
