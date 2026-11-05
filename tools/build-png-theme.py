#!/usr/bin/env python3
"""ແລ່ນຈາກ root ຂອງໂປຣເຈັກ ຫຼັງເພີ່ມ/ປ່ຽນ PNG ໃນ public/icons/png/ :  python3 tools/build-png-theme.py
ສະແກນ PNG ທີ່ມີຈິງ -> ອັບເດດ PNG_SET ໃນ premium-icons.js + CSS ຂອງ theme PNG ໃນ index.html.
ໄອຄອນໃດບໍ່ມີ PNG => ໃຊ້ SVG premium ຕາມເດີມ."""
import re,os,json,sys
R='public'; D=R+'/icons/png'
rels=set()
for dp,_,fs in os.walk(D):
    for f in fs:
        if f.lower().endswith('.png'):
            rels.add(os.path.relpath(os.path.join(dp,f),D).replace(os.sep,'/')[:-4])
# 1) premium-icons.js
p=R+'/premium-icons.js'; s=open(p,encoding='utf-8',newline='').read()
s,n=re.subn(r'var PNG_SET=\{[^;]*\};','var PNG_SET='+json.dumps({k:1 for k in sorted(rels)},separators=(',',':'))+';',s,count=1)
assert n==1; open(p,'w',encoding='utf-8',newline='').write(s)
# 2) index.html
p=R+'/index.html'; t=open(p,encoding='utf-8',newline='').read()
lines=t.split('\n')
st=next(i for i,l in enumerate(lines) if 'Premium: card-head icons that were Font Awesome glyphs' in l)
en=next(i for i,l in enumerate(lines) if '#view-new-cooler-hub) .loan-type-card-title i::before' in l)
region=re.sub(r'/\*.*?\*/','','\n'.join(lines[st:en+1]),flags=re.S)
PRE='html[data-mm-style="premium"]'; out=[]
for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',region):
    sel,body=m.group(1).strip(),m.group(2)
    urls=re.findall(r'/icons/premium/svg/([^"\')]*?)\.svg\?v=\d+',body)
    if not urls or any(u not in rels for u in urls): continue
    body=re.sub(r'/icons/premium/svg/([^"\')]*?)\.svg\?v=\d+',r'/icons/png/\1.png?v=1',body)
    out.append('    '+sel.replace(PRE,PRE+'[data-mm-icons="png"]')+' {'+body.rstrip()+' }')
blk='    /*PNG_BEGIN*/\n'+'\n'.join(out)+('\n' if out else '')+'    /*PNG_END*/'
t,n=re.subn(r'    /\*PNG_BEGIN\*/.*?/\*PNG_END\*/',lambda m:blk,t,count=1,flags=re.S); assert n==1
open(p,'w',encoding='utf-8',newline='').write(t)
print('PNG found:',len(rels),'| CSS rules:',len(out))
