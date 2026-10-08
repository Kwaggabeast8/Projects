import numpy as np, subprocess, sys
W,H,FPS,SECS=960,540,30,8
N=FPS*SECS
rng=np.random.default_rng(7)
yy,xx=np.mgrid[0:H,0:W].astype(np.float32); X=xx/W; Y=yy/H
# periodic wave set (integer temporal freqs => seamless loop)
waves=[(rng.uniform(2,7),rng.uniform(2,6),int(rng.integers(1,3))*rng.choice([-1,1]),rng.uniform(0,6.28)) for _ in range(7)]
# embers
M=140
ex=rng.uniform(.35,1,M); ey=rng.uniform(0,1,M); es=rng.integers(1,4,M); eph=rng.uniform(0,1,M)
er=rng.uniform(1.2,3.2,M); ebr=rng.uniform(.4,1,M); eneon=rng.random(M)<.12
def frame(i):
    t=i/N
    f=np.zeros((H,W),np.float32)
    for fx,fy,k,ph in waves:
        f+=np.sin(2*np.pi*(fx*X*.9+fy*Y*.9)+2*np.pi*k*t+ph)
    f=(f/len(waves)*1.6+1)/2; f=np.clip(f,0,1)**2.2
    dx=(X-.74)*1.05; dy=(Y-.52)*1.7
    mask=np.exp(-(dx*dx+dy*dy)*5.5)
    a=mask*(.25+.9*f)
    img=np.zeros((H,W,3),np.float32)
    img[...,0]=a*1.0; img[...,1]=a*.03; img[...,2]=a*.02
    img+=np.array([.012,.012,.014],np.float32)       # near-black base
    # embers
    for j in range(M):
        py=(ey[j]-es[j]*t*.35*3)%1.0
        px=ex[j]+.02*np.sin(2*np.pi*(es[j]*t+eph[j]))
        cx,cy=px*W,py*H; r=er[j]*2.2
        x0,x1=int(max(cx-r*4,0)),int(min(cx+r*4,W)); y0,y1=int(max(cy-r*4,0)),int(min(cy+r*4,H))
        if x1<=x0 or y1<=y0: continue
        gx=xx[y0:y1,x0:x1]-cx; gy=yy[y0:y1,x0:x1]-cy
        g=np.exp(-(gx*gx+gy*gy)/(2*(r*.55)**2))*ebr[j]*(.6+.4*np.sin(2*np.pi*(2*t+eph[j])))
        col=(0.78,1.0,0.0) if eneon[j] else (1.0,.25,.08)
        for c in range(3): img[y0:y1,x0:x1,c]+=g*col[c]
    # vignette + left darkening so text pops
    vig=1-0.55*((X-.5)**2+(Y-.5)**2)*2
    left=.35+.65*np.clip((X-.15)/.5,0,1)
    img*= (vig*left)[...,None]
    img=np.clip(img,0,1)**(1/1.1)
    return (img*255).astype(np.uint8)
out=sys.argv[1]
p=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-',
  '-vf','scale=1920:1080:flags=lanczos,noise=alls=6:allf=t','-c:v','libx264','-preset','medium','-crf','26','-pix_fmt','yuv420p','-movflags','+faststart','-an',out],stdin=subprocess.PIPE)
for i in range(N): p.stdin.write(frame(i).tobytes())
p.stdin.close(); p.wait()
