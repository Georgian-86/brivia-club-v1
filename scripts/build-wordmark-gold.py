# D-174: rebuilds site/media/assets/brivia-wordmark-gold.webp from source-media/assets/brivia-wordmark-original.png.
# Run from the repo root: pip install pillow numpy fonttools brotli && python3 scripts/build-wordmark-gold.py
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np, sys
F='node_modules/@fontsource/bodoni-moda/files/bodoni-moda-latin-%s-normal.woff2'
for w in ('600',):
    f=TTFont(F%w); f.flavor=None; f.save('/tmp/bodoni%s.ttf'%w)
im=np.asarray(Image.open('source-media/assets/brivia-wordmark-original.png').convert('RGB')).astype(float)
bg=np.array([255,254,250.])
cov=np.clip((np.abs(im-bg).sum(2))/ (np.abs(np.array([40,30,30])-bg).sum()) ,0,1)  # 0..1 ink coverage
r,g,b=im[...,0],im[...,1],im[...,2]
redness=(r-g)
# classify: in top bands; red where pixel hue is reddish relative to darkness
H,W=cov.shape
Y0,Y1,X0,X1=690,1290,488,1516   # wordmark area without tagline
area=np.zeros_like(cov,bool); area[Y0:Y1,X0:X1]=True
# "the" = dark ink in band 696-981; use a label: pixel's saturation
sat=(np.max(im,2)-np.min(im,2))/np.maximum(255-np.min(im,2),1)  # rough
isred=(sat>0.35)
# grow decisions: dark pixels (low sat) in area = black part
black=cov*area*(~isred)
gold=cov*area*isred
# dilate classification for antialias edges: assign edges to nearest major colour by blur
bm=Image.fromarray((area*(~isred)*(cov>0.5)*255).astype('uint8')).filter(ImageFilter.MaxFilter(5))
rm=Image.fromarray((area*isred*(cov>0.5)*255).astype('uint8')).filter(ImageFilter.MaxFilter(5))
bm=np.asarray(bm)>0; rm=np.asarray(rm)>0
black=cov*area*bm*(~rm | ~isred)*(~(rm & ~bm))
gold=cov*area*rm*(~bm | isred)
black=np.where(rm&bm, cov*area*(~isred), black); gold=np.where(rm&bm, cov*area*isred, gold)
ys,xs=np.where((black+gold)>0.3); x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
print('mark',x0,x1,y0,y1)
# tagline: tracked caps across full width
text=sys.argv[1] if len(sys.argv)>1 else 'SWIPE. MATCH. BUILD'
fs=int(sys.argv[2]) if len(sys.argv)>2 else 70
font=ImageFont.truetype('/tmp/bodoni600.ttf',fs)
widths=[font.getlength(c) for c in text]
span=x1-x0; gap=(span-sum(widths))/(len(text)-1)
asc,desc=font.getmetrics()
ty=y1+int(fs*0.62)
TH=ty+asc+desc+40
canvas_h=TH
tl=Image.new('L',(W,canvas_h),0); d=ImageDraw.Draw(tl)
x=x0
for c,wc in zip(text,widths):
    d.text((x,ty),c,font=font,fill=255); x+=wc+gap
tl=np.asarray(tl)/255.
blackA=np.zeros((canvas_h,W)); blackA[:H]=black[:canvas_h] if canvas_h<=H else 0
if canvas_h>H: blackA[:H]=black
blackA=np.maximum(blackA,tl)
goldA=np.zeros((canvas_h,W)); goldA[:min(H,canvas_h)]=gold[:canvas_h]
# gold gradient
yy,xx=np.mgrid[0:canvas_h,0:W]
t=np.clip(((yy-y0)/(y1-y0))*0.85+((xx-x0)/span)*0.15,0,1)
stops=[(0,(246,224,150)),(.38,(214,172,82)),(.55,(160,116,40)),(.72,(222,184,96)),(1,(250,232,166))]
G=np.zeros((canvas_h,W,3))
for (t0,c0),(t1,c1) in zip(stops,stops[1:]):
    mk=(t>=t0)&(t<=t1); f=((t-t0)/(t1-t0))[mk][:,None]
    G[mk]=np.array(c0)+(np.array(c1)-np.array(c0))*f
ink=np.array([22,14,14.])
# gold keyline around black parts so they read on wine
bl_img=Image.fromarray((blackA*255).astype('uint8'))
ring=np.asarray(bl_img.filter(ImageFilter.MaxFilter(int(sys.argv[3]) if len(sys.argv)>3 else 7)).filter(ImageFilter.GaussianBlur(1)))/255.
ringA=np.clip(ring-blackA,0,1)*0.95
# composite: ring (gold) under black under gold mark
out=np.zeros((canvas_h,W,4))
def over(dst,rgb,a):
    a=a[...,None]; dst[...,:3]=rgb*a+dst[...,:3]*(1-a); dst[...,3:]=a+dst[...,3:]*(1-a)
over(out,G,ringA); over(out,np.broadcast_to(ink,(canvas_h,W,3)),blackA); over(out,G,goldA)
# un-premultiply-ish fix: colours already straight since starting from 0 alpha with over — normalise
A=out[...,3:]; rgb=np.where(A>0,out[...,:3]/np.maximum(A,1e-6),0)
res=np.concatenate([rgb,A],2)
img=Image.fromarray((np.clip(res,0,1)*[1,1,1,255] if False else np.dstack([np.clip(rgb,0,255),A*255])).astype('uint8'),'RGBA')
bb=img.getbbox(); img=img.crop((bb[0]-6,bb[1]-6,bb[2]+6,bb[3]+6))
img=img.resize((640,round(640*img.height/img.width)),Image.LANCZOS)
img.save('site/media/assets/brivia-wordmark-gold.webp','WEBP',quality=90,method=6)
prev=Image.new('RGBA',img.size,(67,4,22,255)); prev.alpha_composite(img); pass
print(img.size)
