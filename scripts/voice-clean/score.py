import numpy as np, json, sys, glob, os
tag=sys.argv[1] if len(sys.argv)>1 else 'base'
meta=json.load(open('voices/meta.json'))
def load(p): return np.frombuffer(open(p,'rb').read(),dtype='<f4').astype(np.float64)
def db(x): return 20*np.log10(x+1e-12)
def rms(x): return np.sqrt(np.mean(x**2)+1e-24)
def masks(n,segs,sr):
    v=np.zeros(n,bool); g=np.ones(n,bool)
    for a,b in segs: v[int(a*sr):int(b*sr)]=True
    for a,b in segs: g[max(0,int((a-.12)*sr)):int((b+.25)*sr)]=False   # keep clear of tails
    return v,g
def spec(x,sr,lo,hi,N=2048):
    w=np.hanning(N); fr=[np.abs(np.fft.rfft(x[i:i+N]*w))**2 for i in range(0,len(x)-N,N//2)]
    f=np.fft.rfftfreq(N,1/sr); m=(f>=lo)&(f<hi); return np.array([a[m].sum() for a in fr])
def hum_db(x,sr,g):
    y=x[g]; N=1<<15
    if len(y)<N: y=np.pad(y,(0,N-len(y)))
    P=np.abs(np.fft.rfft(y[:N]*np.hanning(N)))**2; f=np.fft.rfftfreq(N,1/sr); out=[]
    for h in (50,100,150,200):
        k=np.argmin(abs(f-h)); pk=P[k-3:k+4].max(); nb=np.median(np.r_[P[k-60:k-8],P[k+8:k+60]]); out.append(10*np.log10(pk/(nb+1e-30)))
    return float(np.mean(out))
def sib_p95(x,sr,v):
    hi=spec(x,sr,4500,10500); mid=spec(x,sr,300,3000); r=db(np.sqrt(hi/(mid+1e-18)))
    # voiced frames only
    idx=[i for i in range(len(hi)) if v[min(len(v)-1,int((i*1024+1024)))]]
    return float(np.percentile(r[idx],95)),float(np.mean(r[idx]))
def lvl_std(x,sr,v):
    w=int(.4*sr); out=[]
    for i in range(0,len(x)-w,w//2):
        if v[i:i+w].mean()>.5: out.append(db(rms(x[i:i+w])))
    return float(np.std(out)) if len(out)>2 else 0.0
import wave
def wavf(p):
    w=wave.open(p);x=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float64)/32768;return x
def lsd(ref,den,sr,v):
    N=2048;w=np.hanning(N);n=min(len(ref),len(den));f=np.fft.rfftfreq(N,1/sr);m=(f>=100)&(f<4000);out=[]
    g=rms(ref[v[:n]])/max(rms(den[v[:n]]),1e-9)
    for i in range(0,n-N,N//2):
        if v[i:i+N].mean()>.7:
            a=np.abs(np.fft.rfft(ref[i:i+N]*w))[m]+1e-6;b=np.abs(np.fft.rfft(den[i:i+N]*g*w))[m]+1e-6
            da=20*np.log10(a);db_=20*np.log10(b);da-=da.mean();db_-=db_.mean();out.append(np.sqrt(np.mean((da-db_)**2)))
    return float(np.mean(out)) if out else 0.0
rows=[]
for f in sorted(glob.glob(f'out/{tag}_*.json')):
    n=os.path.basename(f)[len(tag)+1:-5]; info=json.load(open(f)); sr=info['sr']
    raw=load(f'out/{tag}_{n}.raw.f32'); pro=load(f'out/{tag}_{n}.pro.f32'); segs=meta[n]['segs']
    v,g=masks(len(raw),segs,sr); v2,g2=masks(len(pro),segs,sr)
    sp_in,sp_out=db(rms(raw[v])),db(rms(pro[v2])); no_in,no_out=db(rms(raw[g])),db(rms(pro[g2]))
    s_in,sm_in=sib_p95(raw,sr,v); s_out,sm_out=sib_p95(pro,sr,v2)
    den=load(f'out/{tag}_{n}.den.f32'); refname=n.rsplit('_',1)[0]+'_clean'; ref=wavf(f'voices/{refname}.wav'); lsdv=lsd(ref,den,sr,v)
    dv,dg=masks(len(den),segs,sr); sden=db(rms(den[dv])); nden=db(rms(den[dg])); hden=hum_db(den,sr,dg)
    rows.append(dict(snr_den=sden-nden,hum_den=hden,lsd=lsdv,n=n,snr_in=sp_in-no_in,snr_out=sp_out-no_out,noise_gain=no_out-no_in-(sp_out-sp_in),hum_in=hum_db(raw,sr,g),hum_out=hum_db(pro,sr,g2),sib_in=s_in,sib_out=s_out,sibd=(s_out-s_in)-(sm_out-sm_in),std_in=lvl_std(raw,sr,v),std_out=lvl_std(pro,sr,v2),sp_out=sp_out,gapdb=no_out))
print(f"{'voice':16}{'SNR in':>8}{'SNR out':>9}{'hum in':>8}{'hum out':>9}{'sib p95 in':>11}{'out':>6}{'sib peak-vs-avg':>16}{'lvl std in':>11}{'out':>6}{'LSD dB':>8}{'SNR den':>9}{'hum den':>9}")
for r in rows: print(f"{r['n']:16}{r['snr_in']:8.1f}{r['snr_out']:9.1f}{r['hum_in']:8.1f}{r['hum_out']:9.1f}{r['sib_in']:11.1f}{r['sib_out']:6.1f}{r['sibd']:16.1f}{r['std_in']:11.1f}{r['std_out']:6.1f}{r['lsd']:8.1f}{r['snr_den']:9.1f}{r['hum_den']:9.1f}")
A=lambda k:np.mean([r[k] for r in rows])
print(f"\nMEAN  SNR {A('snr_in'):.1f} -> {A('snr_out'):.1f} dB (gain {A('snr_out')-A('snr_in'):+.1f})   hum above floor {A('hum_in'):.1f} -> {A('hum_out'):.1f} dB   sibilance p95 {A('sib_in'):.1f} -> {A('sib_out'):.1f}   level std {A('std_in'):.1f} -> {A('std_out'):.1f}   gap level {A('gapdb'):.1f} dBFS   speech distortion (LSD) {A('lsd'):.2f} dB   cleaned-stage SNR {A('snr_den'):.1f} dB, hum {A('hum_den'):.1f} dB")
