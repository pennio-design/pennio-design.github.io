import os, numpy as np, wave, json, random
os.makedirs('voices',exist_ok=True)
SR=44100
def mtof(m): return 440*2**((m-69)/12)
def tone(f0,dur,rng):
    n=int(dur*SR); t=np.arange(n)/SR
    vib=1+0.006*np.sin(2*np.pi*5.3*t)*np.clip(t/.2,0,1)
    ph=2*np.pi*np.cumsum(f0*vib)/SR; y=np.zeros(n)
    for h in range(1,16):
        fh=f0*h; form=np.exp(-((fh-650)/450)**2)+.6*np.exp(-((fh-1800)/700)**2)+.25*np.exp(-((fh-3100)/900)**2)
        y+=np.sin(h*ph)*(1/h**1.1)*(.2+form)
    env=np.minimum(1,t/.03)*np.clip((dur-t)/.07,0,1)
    return y*env
def sib(dur,rng):
    n=int(dur*SR); x=rng.normal(0,1,n)
    # crude high-pass to 5-9 kHz with FFT
    X=np.fft.rfft(x); f=np.fft.rfftfreq(n,1/SR); X*=((f>4500)&(f<10500)).astype(float); y=np.fft.irfft(X,n)
    return y/np.max(np.abs(y)+1e-9)*np.hanning(n)
def voice(seed,f0base,phrases=6,dyn=False):
    rng=np.random.default_rng(seed); r=random.Random(seed); sig=np.zeros(int(9.5*SR)); segs=[]
    t=.6
    for p in range(phrases):
        level=[1.0,.55,.28,.8,.4,.9][p%6] if dyn else .8
        for k in range(r.randint(3,5)):
            dur=r.uniform(.16,.34); f=f0base*2**(r.choice([0,2,3,5,7,8])/12)
            y=tone(f,dur,rng)*level*.5
            i=int(t*SR); sig[i:i+len(y)]+=y[:len(sig)-i] if i+len(y)>len(sig) else y
            if r.random()<.55:   # an 's' after the vowel, as loud as sibilants really are
                s=sib(.11,rng)*level*(.55 if dyn else .38); j=int((t+dur)*SR); seg=s[:max(0,len(sig)-j)]; sig[j:j+len(seg)]+=seg
                segs.append([t,t+dur+.11])
            else: segs.append([t,t+dur])
            t+=dur+r.uniform(.03,.07)
        t+=r.uniform(.45,.7)
        if t>9: break
    return sig,[s for s in segs if s[1]<9.4]
def rmsdb(x): return 20*np.log10(np.sqrt(np.mean(x**2))+1e-12)
def put(name,sig,segs,meta):
    sig=np.clip(sig,-1,1); pcm=(sig*32767).astype(np.int16)
    with wave.open(f'voices/{name}.wav','wb') as w: w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes(pcm.tobytes())
    meta[name]={'segs':segs}
meta={}; cases=[]
for vname,f0,seed,dyn in [('male',118,3,False),('female',232,5,False),('male_dyn',125,7,True)]:
    clean,segs=voice(seed,f0,dyn=dyn); put(f'{vname}_clean',clean,segs,meta)
    rng=np.random.default_rng(seed+100); n=len(clean); t=np.arange(n)/SR
    sp=rmsdb(clean[np.abs(clean)>0.02])
    def at(db): return 10**((sp+db)/20)
    hiss=rng.normal(0,1,n)*at(-24)            # speech-to-hiss 24 dB
    hum=sum(np.sin(2*np.pi*50*h*t+h)*(1/h**.7) for h in range(1,9)); hum=hum/np.sqrt(np.mean(hum**2))*at(-26)
    X=np.fft.rfft(rng.normal(0,1,n)); f=np.fft.rfftfreq(n,1/SR); X[1:]/=np.sqrt(f[1:]); pink=np.fft.irfft(X,n); pink=pink/np.sqrt(np.mean(pink**2))*at(-22)
    rumble=np.sin(2*np.pi*38*t)*at(-18)*.5+rng.normal(0,1,n)*0
    for tag,noise in [('hiss',hiss),('hum',hum+rng.normal(0,1,n)*at(-40)),('room',pink+rumble)]:
        put(f'{vname}_{tag}',clean+noise,segs,meta)
json.dump(meta,open('voices/meta.json','w'))
print(len(meta),'files')
