import numpy as np, wave
SR=44100; D=15.0; N=int(SR*D); t=np.arange(N)/SR
rng=np.random.default_rng(7)
L=np.zeros(N); R=np.zeros(N)
def add(sig,start,gain=1.0,pan=0.0):
    i=int(start*SR); n=min(len(sig),N-i)
    if n<=0: return
    L[i:i+n]+=sig[:n]*gain*(1-max(0,pan)); R[i:i+n]+=sig[:n]*gain*(1+min(0,pan))
def env(n,a,r):
    x=np.arange(n)/SR; return np.minimum(1,x/a)*np.exp(-x/r)
def lp(x,fc):
    a=np.exp(-2*np.pi*fc/SR); y=np.zeros_like(x); s=0.0
    for i in range(len(x)): s=(1-a)*x[i]+a*s; y[i]=s
    return y
def bp_noise(n,f0,f1):
    w=rng.standard_normal(n); out=np.zeros(n); cut=np.geomspace(f0,f1,n); s1=s2=0.0
    for i in range(n):
        a=np.exp(-2*np.pi*cut[i]/SR); s1=(1-a)*w[i]+a*s1; s2=(1-a)*s1+a*s2; out[i]=s1-s2
    return out/np.abs(out).max()
pad=np.zeros(N)
for f,g in [(110,1.0),(164.81,.8),(220,.7),(277.18,.45),(493.88,.2)]:
    for det in (-0.6,0.0,0.7):
        pad+=g*np.sin(2*np.pi*(f+det)*t)*(0.5+0.5*np.sin(2*np.pi*(0.07+0.01*f/110)*t+f))
swell=np.clip(t/2.0,0,1)*np.clip((D-t)/1.4,0,1)
pad=lp(pad,900)*swell; pad/=np.abs(pad).max(); add(pad,0,0.09)
for k,s in enumerate([.35,.5,1.25,2.0,4.45,4.63,5.5,5.65,9.05,9.85,10.65,11.45]):
    n=int(.28*SR); add(bp_noise(n,1800,5200)*env(n,.012,.07),s,0.16,pan=(-.3 if k%2 else .3))
for c in (3.95,8.55,12.05):
    n=int(1.0*SR); w=bp_noise(n,260,3800); shape=np.sin(np.linspace(0,np.pi,n))**1.6; add(w*shape,c-.5,0.34)
    add(np.sin(2*np.pi*np.geomspace(70,38,n).cumsum()/SR)*shape,c-.5,0.16)
n=int(1.2*SR); x=np.arange(n)/SR
add(np.sin(2*np.pi*(52+60*np.exp(-x*18))*x)*np.exp(-x/0.22),12.40,0.42)
bell=sum(a*np.sin(2*np.pi*f*x)*np.exp(-x/d) for f,a,d in [(880,1,1.3),(1318.5,.6,1.0),(1760,.35,.7),(2637,.18,.45)])
add(bell,12.40,0.17,pan=.15)
n=int(.5*SR); x=np.arange(n)/SR; add((np.sin(2*np.pi*1568*x)+.5*np.sin(2*np.pi*2349*x))*np.exp(-x/.16),13.9,0.11)
n=int(.9*SR); x=np.arange(n)/SR; add(np.sin(2*np.pi*1318.5*x)*np.exp(-x/.35),13.0,0.07,pan=-.2)
fade=np.clip(t/0.08,0,1)*np.clip((D-t)/0.9,0,1); L*=fade; R*=fade
M=np.tanh(np.vstack([L,R])*1.1); M*=10**(-3/20)/np.abs(M).max()
print('peak %.1f dBFS, clipped %d'%(20*np.log10(np.abs(M).max()),(np.abs(M)>=0.999).sum()))
w=wave.open('ad-audio.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((M.T*32767).astype('<i2').tobytes()); w.close()
