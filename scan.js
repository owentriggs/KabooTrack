// Reads playing cards from a photo, entirely on this device: no network, no account, no cost.
// 1. Find the white card shapes against the table.
// 2. Straighten each card into an upright rectangle.
// 3. Read the rank in its top-left corner by comparing it with ranks drawn in several fonts.
// A card's index sits in two opposite corners, so whichever way up the card lies, the top-left one reads upright.
(function(global){
  var RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  var CW=240,CH=336;      // straightened card size
  var GX=12,GY=18;        // rank glyph feature grid
  var MAXSIDE=1400;       // photos are shrunk to this before reading
  var SPLIT_DIP=12;       // how much darker the line between two touching cards must be
  var FONTS=['bold 100px sans-serif','100px sans-serif','bold 100px serif','100px serif',
    'bold 100px Georgia,serif','bold 100px "Arial Narrow","Roboto Condensed",sans-serif','bold 100px "Courier New",monospace'];

  /* ---------- image in ---------- */
  function load(file){
    return new Promise(function(res,rej){
      var url=URL.createObjectURL(file),img=new Image();
      img.onload=function(){
        var w=img.naturalWidth,h=img.naturalHeight,s=Math.min(1,MAXSIDE/Math.max(w,h));
        var c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*s));c.height=Math.max(1,Math.round(h*s));
        var g=c.getContext('2d');g.drawImage(img,0,0,c.width,c.height);
        URL.revokeObjectURL(url);
        res({canvas:c,data:g.getImageData(0,0,c.width,c.height)});
      };
      img.onerror=function(){URL.revokeObjectURL(url);rej(new Error('That photo could not be opened. Try another one.'));};
      img.src=url;
    });
  }

  /* ---------- helpers ---------- */
  function otsu(hist,total){
    var sum=0,i;for(i=0;i<256;i++)sum+=i*hist[i];
    var sb=0,wb=0,best=0,t=128;
    for(i=0;i<256;i++){
      wb+=hist[i];if(!wb)continue;
      var wf=total-wb;if(!wf)break;
      sb+=i*hist[i];
      var mb=sb/wb,mf=(sum-sb)/wf,v=wb*wf*(mb-mf)*(mb-mf);
      if(v>best){best=v;t=i;}
    }
    return t;
  }
  // Square min filter (erosion) of a 0/1 mask, radius r.
  function erode(m,w,h,r){
    if(r<1)return m.slice();
    var tmp=new Uint16Array(w*h),out=new Uint8Array(w*h),x,y,run;
    for(y=0;y<h;y++){
      run=0;var row=y*w;
      for(x=0;x<w;x++){run=m[row+x]?run+1:0;tmp[row+x]=run;}
      // tmp holds run length ending at x; a pixel survives if the run through x+r covers 2r+1.
      for(x=0;x<w;x++){var e=Math.min(w-1,x+r);out[row+x]=(x-r>=0&&e===x+r&&tmp[row+e]>=2*r+1)?1:0;}
    }
    for(x=0;x<w;x++){
      run=0;
      for(y=0;y<h;y++){run=out[y*w+x]?run+1:0;tmp[y*w+x]=run;}
      for(y=0;y<h;y++){var e2=y+r;out[y*w+x]=(y-r>=0&&e2<h&&tmp[e2*w+x]>=2*r+1)?1:0;}
    }
    return out;
  }
  // Connected components (8-way). Returns arrays of pixel indices.
  function components(m,w,h,minArea){
    var lab=new Int32Array(w*h),stack=new Int32Array(w*h),out=[],id=0;
    for(var s=0;s<w*h;s++){
      if(!m[s]||lab[s])continue;
      id++;var sp=0,px=[];stack[sp++]=s;lab[s]=id;
      while(sp){
        var p=stack[--sp];px.push(p);
        var x=p%w,y=(p-x)/w;
        for(var dy=-1;dy<=1;dy++){var yy=y+dy;if(yy<0||yy>=h)continue;
          for(var dx=-1;dx<=1;dx++){var xx=x+dx;if(xx<0||xx>=w)continue;
            var q=yy*w+xx;if(m[q]&&!lab[q]){lab[q]=id;stack[sp++]=q;}}}
      }
      if(px.length>=minArea)out.push(px);
    }
    return out;
  }
  function hull(pts){
    pts.sort(function(a,b){return a[0]-b[0]||a[1]-b[1];});
    function cross(o,a,b){return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);}
    var lo=[],up=[],i;
    for(i=0;i<pts.length;i++){while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],pts[i])<=0)lo.pop();lo.push(pts[i]);}
    for(i=pts.length-1;i>=0;i--){while(up.length>=2&&cross(up[up.length-2],up[up.length-1],pts[i])<=0)up.pop();up.push(pts[i]);}
    up.pop();lo.pop();return lo.concat(up);
  }
  // Smallest rotated rectangle around a component.
  function minRect(px,w){
    var rows={},cols={};
    px.forEach(function(p){var x=p%w,y=(p-x)/w,r=rows[y],c=cols[x];
      if(!r)rows[y]=[x,x];else{if(x<r[0])r[0]=x;if(x>r[1])r[1]=x;}
      if(!c)cols[x]=[y,y];else{if(y<c[0])c[0]=y;if(y>c[1])c[1]=y;}});
    var pts=[],span=0,edge=[];
    Object.keys(rows).forEach(function(y){var r=rows[y];y=+y;span+=r[1]-r[0]+1;pts.push([r[0],y],[r[1]+1,y],[r[0],y+1],[r[1]+1,y+1]);edge.push([r[0],y+0.5],[r[1]+1,y+0.5]);});
    Object.keys(cols).forEach(function(x){var c=cols[x];x=+x;edge.push([x+0.5,c[0]],[x+0.5,c[1]+1]);});
    var H=hull(pts),best=null;
    for(var i=0;i<H.length;i++){
      var a=H[i],b=H[(i+1)%H.length],ex=b[0]-a[0],ey=b[1]-a[1],len=Math.hypot(ex,ey);if(!len)continue;
      ex/=len;ey/=len;
      var a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;
      for(var j=0;j<H.length;j++){var p=H[j],s=p[0]*ex+p[1]*ey,t=-p[0]*ey+p[1]*ex;if(s<a0)a0=s;if(s>a1)a1=s;if(t<b0)b0=t;if(t>b1)b1=t;}
      var area=(a1-a0)*(b1-b0);
      if(!best||area<best.area)best={area:area,ex:ex,ey:ey,a0:a0,a1:a1,b0:b0,b1:b1};
    }
    var sm=(best.a0+best.a1)/2,tm=(best.b0+best.b1)/2;
    var cx=sm*best.ex-tm*best.ey,cy=sm*best.ey+tm*best.ex;
    var la=best.a1-best.a0,lb=best.b1-best.b0;
    // u runs along the long side
    var ux,uy,L,S;
    if(la>=lb){ux=best.ex;uy=best.ey;L=la;S=lb;}else{ux=-best.ey;uy=best.ex;L=lb;S=la;}
    if(uy<0||(uy===0&&ux<0)){ux=-ux;uy=-uy;}
    return {cx:cx,cy:cy,ux:ux,uy:uy,L:L,S:S,area:best.area,span:span,edge:edge};
  }

  // Fill enclosed gaps in the white mask (court pictures, pips) so each card is one solid shape.
  // Thin gaps are left open: those are the lines between cards that touch, when there is one.
  function fillHoles(m,w,h){
    var inv=new Uint8Array(w*h),i;
    for(i=0;i<w*h;i++)inv[i]=m[i]?0:1;
    components(inv,w,h,1).forEach(function(px){
      var x0=1e9,x1=-1,y0=1e9,y1=-1,edge=false;
      for(var k=0;k<px.length;k++){var p=px[k],x=p%w,y=(p-x)/w;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
      if(x0===0||y0===0||x1===w-1||y1===h-1)return;
      var thick=px.length/Math.max(x1-x0+1,y1-y0+1);
      if(thick<4&&px.length>40)return;
      px.forEach(function(p){m[p]=1;});
    });
  }

  // The card's four real corners, found on its outline.
  // Using these instead of the rectangle undoes the slant when the photo is taken at an angle.
  function corners(R){
    var vx=R.uy,vy=-R.ux;
    return [[-1,-1],[1,-1],[1,1],[-1,1]].map(function(q){
      return [R.cx+q[0]*R.S/2*vx+q[1]*R.L/2*R.ux,R.cy+q[0]*R.S/2*vy+q[1]*R.L/2*R.uy];});
  }
  // Fit a straight line along the middle of each side (the corners can be notched by the printed rank),
  // then the card's corners are where those lines meet.
  function quad(R,r){
    var vx=R.uy,vy=-R.ux,sides=[[],[],[],[]],tol=Math.max(3,R.S*0.06);
    R.edge.forEach(function(p){
      var dx=p[0]-R.cx,dy=p[1]-R.cy,s=dx*R.ux+dy*R.uy,t=dx*vx+dy*vy;
      if(Math.abs(t)<R.S*0.35){if(Math.abs(s+R.L/2)<tol)sides[0].push(p);else if(Math.abs(s-R.L/2)<tol)sides[2].push(p);}
      if(Math.abs(s)<R.L*0.35){if(Math.abs(t-R.S/2)<tol)sides[1].push(p);else if(Math.abs(t+R.S/2)<tol)sides[3].push(p);}
    });
    var out=r+Math.min(R.L,R.S)*0.03; // undo the erosion, plus a little table so the edge is easy to find
    var lines=sides.map(function(pts,i){
      if(pts.length<6)return null;
      var mx=0,my=0;pts.forEach(function(p){mx+=p[0];my+=p[1];});mx/=pts.length;my/=pts.length;
      var sxx=0,sxy=0,syy=0;pts.forEach(function(p){var a=p[0]-mx,b=p[1]-my;sxx+=a*a;sxy+=a*b;syy+=b*b;});
      var ang=0.5*Math.atan2(2*sxy,sxx-syy),dx=Math.cos(ang),dy=Math.sin(ang);
      // push the line outwards, away from the centre
      var nx=-dy,ny=dx;if((mx-R.cx)*nx+(my-R.cy)*ny<0){nx=-nx;ny=-ny;}
      return {x:mx+nx*out,y:my+ny*out,dx:dx,dy:dy};
    });
    if(lines.some(function(l){return !l;}))return null;
    function meet(a,b){
      var den=a.dx*b.dy-a.dy*b.dx;if(Math.abs(den)<1e-6)return null;
      var t=((b.x-a.x)*b.dy-(b.y-a.y)*b.dx)/den;return [a.x+a.dx*t,a.y+a.dy*t];
    }
    // sides: 0 top, 1 right, 2 bottom, 3 left (in the card's own frame); corners clockwise from top-left
    var q=[meet(lines[3],lines[0]),meet(lines[0],lines[1]),meet(lines[1],lines[2]),meet(lines[2],lines[3])];
    if(q.some(function(p){return !p||Math.hypot(p[0]-R.cx,p[1]-R.cy)>Math.hypot(R.L,R.S);}))return null;
    return q;
  }
  // Perspective transform taking the straightened card's corners to the four points in the photo.
  function homography(q){
    var src=[[0,0],[CW,0],[CW,CH],[0,CH]],A=[],i,j,k;
    for(i=0;i<4;i++){
      var x=src[i][0],y=src[i][1],X=q[i][0],Y=q[i][1];
      A.push([x,y,1,0,0,0,-x*X,-y*X,X]);A.push([0,0,0,x,y,1,-x*Y,-y*Y,Y]);
    }
    for(i=0;i<8;i++){
      var piv=i;for(j=i+1;j<8;j++)if(Math.abs(A[j][i])>Math.abs(A[piv][i]))piv=j;
      var t=A[i];A[i]=A[piv];A[piv]=t;
      if(Math.abs(A[i][i])<1e-12)return null;
      for(j=0;j<8;j++){if(j===i)continue;var f=A[j][i]/A[i][i];for(k=i;k<9;k++)A[j][k]-=f*A[i][k];}
    }
    var hm=[];for(i=0;i<8;i++)hm.push(A[i][8]/A[i][i]);hm.push(1);return hm;
  }

  /* ---------- 1. find cards ---------- */
  function findCards(img){
    var w=img.width,h=img.height,d=img.data,n=w*h,i;
    var hist=new Array(256).fill(0),lo=new Uint8Array(n),sat=new Uint8Array(n);
    for(i=0;i<n;i++){
      var r=d[i*4],g=d[i*4+1],b=d[i*4+2],mn=Math.min(r,g,b),mx=Math.max(r,g,b);
      lo[i]=mn;sat[i]=mx-mn;hist[mn]++;
    }
    var T=Math.max(100,otsu(hist,n));
    var base=new Uint8Array(n);
    for(i=0;i<n;i++)base[i]=(lo[i]>T&&sat[i]<80)?1:0;
    // close hairline cracks inside a card (creases, glare, a printed line) so they cannot split it
    var rc=Math.max(1,Math.round(Math.min(w,h)*0.002)),inv=new Uint8Array(n);
    for(i=0;i<n;i++)inv[i]=1-base[i];
    inv=erode(inv,w,h,rc);for(i=0;i<n;i++)inv[i]=1-inv[i];  // grow the white
    base=erode(inv,w,h,rc);                                   // and shrink it back
    fillHoles(base,w,h);
    var white=base.slice();

    var r0=Math.max(1,Math.round(Math.min(w,h)*0.004)),minA=n*0.002,found=[],rest=[];
    // Erode harder each pass so cards that touch come apart; keep what looks like a card at each pass.
    for(var k=0;k<=4;k++){
      var r=r0*k,m=erode(base,w,h,r);
      components(m,w,h,minA).forEach(function(px){
        // fill counts each row from its leftmost to rightmost pixel, so pictures and pips inside a card count as card
        var R=minRect(px,w),fill=R.span/R.area,asp=R.L/R.S;
        if(k===0&&fill>0.55&&!(fill>0.8&&asp>1.15&&asp<1.8)){R.L+=2*r;R.S+=2*r;R.pix=px;delete R.edge;rest.push(R);}
        if(fill>0.8&&asp>1.15&&asp<1.8){
          R.q=quad(R,r);R.L+=2*r;R.S+=2*r;delete R.edge;found.push(R);
          // remove this card from later passes
          px.forEach(function(p){base[p]=0;});
          var c=0;// clear the ring around it too
          for(var y=Math.max(0,Math.floor(R.cy-R.L/2-r));y<Math.min(h,R.cy+R.L/2+r);y++)
            for(var x=Math.max(0,Math.floor(R.cx-R.L/2-r));x<Math.min(w,R.cx+R.L/2+r);x++){
              var dx=x-R.cx,dy=y-R.cy,s=Math.abs(dx*R.ux+dy*R.uy),t=Math.abs(-dx*R.uy+dy*R.ux);
              if(s<=R.L/2+1&&t<=R.S/2+1){base[y*w+x]=0;c++;}
            }
        }
      });
    }
    // rectangular shapes that never came apart: cards touching, split below
    rest.forEach(function(R){var left=0;R.pix.forEach(function(p){left+=base[p];});if(left>R.pix.length*0.7)found.push(R);delete R.pix;});
    if(!found.length)return [];
    var areas=found.map(function(c){return c.L*c.S;}).sort(function(a,b){return a-b;});
    var med=areas[Math.floor(areas.length/2)];
    var Ls=found.map(function(c){return c.L;}).sort(function(a,b){return a-b;}),Ss=found.map(function(c){return c.S;}).sort(function(a,b){return a-b;});
    var Lc=Ls[Ls.length>>1],Sc=Ss[Ss.length>>1];
    // A shape the size of several cards is cards touching each other: cut it into a grid of card-sized pieces.
    var split=[];
    found=found.filter(function(R){
      if(R.L*R.S<med*1.7)return true;
      var opts=[[Lc,Sc,false],[Sc,Lc,true]].map(function(o){
        var nL=Math.max(1,Math.round(R.L/o[0])),nS=Math.max(1,Math.round(R.S/o[1]));
        return {nL:nL,nS:nS,cross:o[2],err:Math.abs(R.L-nL*o[0])/R.L+Math.abs(R.S-nS*o[1])/R.S};
      }).sort(function(a,b){return a.err-b.err;});
      var o=opts[0];
      if(o.err>0.3||o.nL*o.nS<2||o.nL*o.nS>12)return true;
      var vx=R.uy,vy=-R.ux;
      for(var i=0;i<o.nL;i++)for(var j=0;j<o.nS;j++){
        var a=((i+0.5)/o.nL-0.5)*R.L,b=((j+0.5)/o.nS-0.5)*R.S,cl=R.L/o.nL,cs=R.S/o.nS;
        var c={cx:R.cx+a*R.ux+b*vx,cy:R.cy+a*R.uy+b*vy,ux:R.ux,uy:R.uy,L:cl,S:cs};
        if(o.cross){c.ux=vx;c.uy=vy;c.L=cs;c.S=cl;if(c.uy<0||(c.uy===0&&c.ux<0)){c.ux=-c.ux;c.uy=-c.uy;}}
        split.push(c);
      }
      return false;
    });
    found=found.concat(split);
    // Cards laid edge to edge make one white shape. Where two cards meet there is still a faint line,
    // so try cutting the shape into a grid of card-shaped pieces and keep a cut only if every line is there.
    var lum=new Float32Array(n);
    for(i=0;i<n;i++)lum[i]=0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2];
    found=found.reduce(function(acc,R){return acc.concat(splitTouching(R,lum,w,h));},[]);
    // a grid cell with no card in it (an odd number of cards laid edge to edge)
    found=found.filter(function(R){
      var vx=R.uy,vy=-R.ux,on=0,tot=0;
      for(var a=-0.4;a<=0.4;a+=0.1)for(var b=-0.4;b<=0.4;b+=0.1){
        var x=Math.round(R.cx+a*R.L*R.ux+b*R.S*vx),y=Math.round(R.cy+a*R.L*R.uy+b*R.S*vy);
        if(x>=0&&y>=0&&x<w&&y<h){tot++;on+=white[y*w+x];}
      }
      return tot&&on/tot>0.6;
    });
    areas=found.map(function(c){return c.L*c.S;}).sort(function(a,b){return a-b;});
    med=areas[Math.floor(areas.length/2)];
    found=found.filter(function(c){var a=c.L*c.S;return a>med*0.45&&a<med*2.2;});
    // reading order: rows top to bottom, then left to right
    found.sort(function(a,b){return a.cy-b.cy;});
    var rows=[],tol=Math.sqrt(med)*0.45;
    found.forEach(function(c){var row=rows[rows.length-1];if(row&&Math.abs(c.cy-row.y)<tol){row.c.push(c);row.y=(row.y*(row.c.length-1)+c.cy)/row.c.length;}else rows.push({y:c.cy,c:[c]});});
    var out=[];rows.forEach(function(row){row.c.sort(function(a,b){return a.cx-b.cx;});out=out.concat(row.c);});
    return out;
  }

  function splitTouching(R,lum,w,h){
    var vx=R.uy,vy=-R.ux,best=null;
    function at(x,y){x=Math.round(x);y=Math.round(y);return x>=0&&y>=0&&x<w&&y<h?lum[y*w+x]:0;}
    // how clearly a dark line runs across the shape at position f (0..1) along axis a (0: across the long side)
    function line(a,f){
      var len=a?R.L:R.S,across=a?R.S:R.L;      // the line runs along len, and sits at f across 'across'
      var dx=a?R.ux:vx,dy=a?R.uy:vy,nx=a?vx:R.ux,ny=a?vy:R.uy;
      var bestDip=-1e9,step=Math.max(1,across*0.006),gap=Math.max(3,across*0.02);
      for(var o=-across*0.05;o<=across*0.05;o+=step){
        var c=(f-0.5)*across+o,dips=[];
        for(var k=0;k<40;k++){
          var t=((k+0.5)/40-0.5)*len*0.9,x=R.cx+dx*t+nx*c,y=R.cy+dy*t+ny*c;
          var m=Math.min(at(x,y),at(x+nx,y+ny),at(x-nx,y-ny));
          dips.push((at(x+nx*gap,y+ny*gap)+at(x-nx*gap,y-ny*gap))/2-m);
        }
        dips.sort(function(p,q){return p-q;});
        var v=dips[Math.floor(dips.length*0.3)];   // most of the line has to be darker, not just a pip it crosses
        if(v>bestDip)bestDip=v;
      }
      return bestDip;
    }
    var cands=[];
    for(var nr=1;nr<=3;nr++)for(var nc=1;nc<=3;nc++){
      if(nr*nc<2)continue;
      var cl=R.L/nr,cs=R.S/nc,a=Math.max(cl,cs)/Math.min(cl,cs);
      if(Math.abs(a-1.4)<0.25)cands.push({nr:nr,nc:nc});
    }
    cands.sort(function(p,q){return q.nr*q.nc-p.nr*p.nc;});
    for(var ci=0;ci<cands.length&&!best;ci++){
      var c=cands[ci],ev=1e9,k2;
      for(k2=1;k2<c.nr;k2++)ev=Math.min(ev,line(0,k2/c.nr));
      for(k2=1;k2<c.nc;k2++)ev=Math.min(ev,line(1,k2/c.nc));
      if(ev>SPLIT_DIP)best=c;
    }
    if(!best)return [R];
    var out=[];
    for(var i=0;i<best.nr;i++)for(var j=0;j<best.nc;j++){
      var a1=((i+0.5)/best.nr-0.5)*R.L,b1=((j+0.5)/best.nc-0.5)*R.S,cl2=R.L/best.nr,cs2=R.S/best.nc;
      var q={cx:R.cx+a1*R.ux+b1*vx,cy:R.cy+a1*R.uy+b1*vy,ux:R.ux,uy:R.uy,L:cl2,S:cs2};
      if(cs2>cl2){q.ux=vx;q.uy=vy;q.L=cs2;q.S=cl2;if(q.uy<0||(q.uy===0&&q.ux<0)){q.ux=-q.ux;q.uy=-q.uy;}}
      out.push(q);
    }
    return out;
  }

  /* ---------- 2. straighten ---------- */
  function warp(img,R){
    var w=img.width,h=img.height,d=img.data,out=new Uint8ClampedArray(CW*CH*4);
    // corners run clockwise from the top-left, which keeps the picture unmirrored
    var M=homography(R.q||corners(R))||homography(corners(R));
    for(var y=0;y<CH;y++){
      for(var x=0;x<CW;x++){
        var X=x+0.5,Y=y+0.5,z=M[6]*X+M[7]*Y+M[8];
        var sx=(M[0]*X+M[1]*Y+M[2])/z-0.5,sy=(M[3]*X+M[4]*Y+M[5])/z-0.5;
        var x0=Math.floor(sx),y0=Math.floor(sy),ax=sx-x0,ay=sy-y0,o=(y*CW+x)*4;
        if(x0<0||y0<0||x0+1>=w||y0+1>=h){out[o]=out[o+1]=out[o+2]=0;out[o+3]=255;continue;}
        for(var c=0;c<3;c++){
          var p=(y0*w+x0)*4+c;
          out[o+c]=(d[p]*(1-ax)+d[p+4]*ax)*(1-ay)+(d[p+w*4]*(1-ax)+d[p+w*4+4]*ax)*ay;
        }
        out[o+3]=255;
      }
    }
    return out;
  }

  /* ---------- 3. read the corner ---------- */
  function readCard(px){
    var n=CW*CH,lum=new Float32Array(n),red=new Float32Array(n),i;
    var hist=new Array(256).fill(0);
    for(i=0;i<n;i++){
      var r=px[i*4],g=px[i*4+1],b=px[i*4+2];
      lum[i]=0.299*r+0.587*g+0.114*b;red[i]=r-(g+b)/2;hist[Math.min(255,lum[i]|0)]++;
    }
    // paper brightness: the 85th percentile, so lighting does not matter
    var acc=0,white=255;for(i=255;i>=0;i--){acc+=hist[i];if(acc>n*0.15){white=Math.max(60,i);break;}}
    var ink=new Uint8Array(n);
    for(i=0;i<n;i++)ink[i]=(lum[i]<white*0.6||(red[i]>white*0.28&&lum[i]<white*0.85))?1:0;
    // Ink touching the card's outer edge is the table, a printed border or shadow: drop it.
    var stack=[];
    for(i=0;i<CW;i++){stack.push(i,(CH-1)*CW+i);}for(i=0;i<CH;i++){stack.push(i*CW,i*CW+CW-1);}
    // How deep the dark edge runs on each side: rows or columns that are mostly ink.
    function depth(len,line){for(var k=0;k<len*0.1;k++){if(line(k)<0.4)return k;}return Math.round(len*0.1);}
    function rowInk(y){var c=0;for(var x=CW*0.15|0;x<CW*0.85;x++)c+=ink[y*CW+x];return c/(CW*0.7);}
    function colInk(x){var c=0;for(var y=CH*0.15|0;y<CH*0.85;y++)c+=ink[y*CW+x];return c/(CH*0.7);}
    var bt=depth(CH,function(k){return rowInk(k);}),bb=depth(CH,function(k){return rowInk(CH-1-k);});
    var bl=depth(CW,function(k){return colInk(k);}),br=depth(CW,function(k){return colInk(CW-1-k);});
    while(stack.length){var p=stack.pop();if(!ink[p])continue;var x=p%CW,y=(p-x)/CW;
      if(x>bl&&y>bt&&x<CW-1-br&&y<CH-1-bb)continue; // only strip the edge itself, so a rank printed close to it survives
      ink[p]=0;
      if(x>0)stack.push(p-1);if(x<CW-1)stack.push(p+1);if(y>0)stack.push(p-CW);if(y<CH-1)stack.push(p+CW);}
    // corner region
    var RW=Math.round(CW*0.5),RH=Math.round(CH*0.42),reg=new Uint8Array(RW*RH);
    for(var y2=0;y2<RH;y2++)for(var x2=0;x2<RW;x2++)reg[y2*RW+x2]=ink[y2*CW+x2];
    // Long straight runs are the picture frame of a court card, never part of a rank: clear them.
    var run,xx,yy,lv=Math.round(CH*0.2),lh=Math.round(CW*0.3);
    for(xx=0;xx<RW;xx++){run=0;for(yy=0;yy<=RH;yy++){if(yy<RH&&reg[yy*RW+xx])run++;else{if(run>=lv)for(var k1=yy-run;k1<yy;k1++)reg[k1*RW+xx]=0;run=0;}}}
    for(yy=0;yy<RH;yy++){run=0;for(xx=0;xx<=RW;xx++){if(xx<RW&&reg[yy*RW+xx])run++;else{if(run>=lh)for(var k2=xx-run;k2<xx;k2++)reg[yy*RW+k2]=0;run=0;}}}
    var minA=Math.round(CW*CH*0.0002),raw=components(reg,RW,RH,minA),pieces=[];
    // A rank that touches the picture frame or a pip comes out as one big shape: trim thin joins and look again.
    raw.forEach(function(p){
      var x0=1e9,x1=-1,y0=1e9,y1=-1;
      p.forEach(function(q){var x=q%RW,y=(q-x)/RW;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;});
      if(!(x0<CW*0.16&&y0<CH*0.16&&(y1-y0>CH*0.2||x1-x0>CW*0.22))){pieces.push(p);return;}
      for(var r=1;r<=3;r++){
        var m=new Uint8Array(RW*RH);p.forEach(function(q){m[q]=1;});
        var e=erode(m,RW,RH,r),o=new Uint8Array(RW*RH);
        // grow back what survived, but only onto the shape's own pixels
        for(var y=0;y<RH;y++)for(var x=0;x<RW;x++){if(!e[y*RW+x])continue;
          for(var dy=-r;dy<=r;dy++)for(var dx=-r;dx<=r;dx++){var yy=y+dy,xx=x+dx;if(yy>=0&&yy<RH&&xx>=0&&xx<RW&&m[yy*RW+xx])o[yy*RW+xx]=1;}}
        var sub=components(o,RW,RH,minA);
        if(sub.length>1){pieces=pieces.concat(sub);return;}
      }
      pieces.push(p);
    });
    var comps=pieces.map(function(p){
      var x0=1e9,x1=-1,y0=1e9,y1=-1,rs=0,plain=0;
      p.forEach(function(q){var x=q%RW,y=(q-x)/RW,o=(y*CW+x)*4;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
        var isRed=red[y*CW+x]>white*0.2;rs+=isRed?1:0;
        var r=px[o],g=px[o+1],b=px[o+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);
        if(isRed||mx-mn<white*0.25)plain++;});
      // printed ranks are plain black or red; blue, yellow or green ink is part of a picture
      return {p:p,x0:x0,x1:x1,y0:y0,y1:y1,w:x1-x0+1,h:y1-y0+1,red:rs/p.length,plain:plain/p.length};
    }).filter(function(c){
      // drop slivers of the card's own edge left over by a slanted photo
      if(c.x0<CW*0.03&&c.w<c.h*0.3)return false;
      if(c.y0<CH*0.03&&c.h<c.w*0.3)return false;
      if(c.w<c.h*0.18||c.h<c.w*0.18)return false; // hairlines: a neighbouring card's edge, a crease
      if(c.plain<0.7)return false;
      return c.h>=CH*0.03&&c.h<=CH*0.2&&c.w<=CW*0.22;
    });
    var all=comps;
    // the rank starts close to the corner
    comps=all.filter(function(c){return c.x0<CW*0.16&&c.y0<CH*0.16;});
    if(!comps.length)return null;
    comps.sort(function(a,b){return a.y0-b.y0;});
    // the first mark: never much wider than tall (a 10 is two marks), so a flat sliver of edge or shadow is skipped
    var top=comps.filter(function(c){return c.w<=c.h*1.3;})[0];
    if(!top)return null;
    var grp=[top];
    // gather the rest of the rank on the same line (the 0 of a 10, the letters of JOKER)
    var changed=true;
    while(changed){changed=false;
      all.forEach(function(c){
        if(grp.indexOf(c)>=0)return;
        var ov=Math.min(c.y1,top.y1)-Math.max(c.y0,top.y0);
        var gx0=Math.min.apply(null,grp.map(function(g){return g.x0;})),gx1=Math.max.apply(null,grp.map(function(g){return g.x1;}));
        var gap=Math.max(c.x0-gx1,gx0-c.x1);
        if(ov>=0.5*Math.min(c.h,top.h)&&gap<=top.h*0.3&&c.h>top.h*0.6){grp.push(c);changed=true;}
      });
    }
    var isRed=grp.reduce(function(a,c){return a+c.red*c.p.length;},0)/grp.reduce(function(a,c){return a+c.p.length;},0)>0.4;
    // JOKER written across: three or more letter-sized marks in a row (a rank is at most two: 10)
    var hs=grp.map(function(c){return c.h;}).sort(function(a,b){return a-b;}),mh=hs[hs.length>>1];
    var letters=grp.filter(function(c){return c.h>mh*0.8&&c.h<mh*1.3&&Math.abs(c.y0-top.y0)<mh*0.2&&c.w<c.h*1.1;});
    if(letters.length>=3)return {rank:'Joker',red:isRed,score:0};
    // otherwise keep the marks closest to the corner: a rank is at most two (10)
    grp.sort(function(a,b){return a.x0-b.x0;});grp=grp.slice(0,2);
    // JOKER written downwards: a tight column of letter-sized marks under the first (a normal card has one suit mark there)
    var chain=[top],cur=top;
    for(var guard=0;guard<6;guard++){
      var cx=(cur.x0+cur.x1)/2,nx=null;
      all.forEach(function(c){
        if(chain.indexOf(c)>=0||c.y0<=cur.y1-1||c.y0>cur.y1+top.h*0.5)return;
        if(Math.abs((c.x0+c.x1)/2-cx)>top.h*0.5||c.h<top.h*0.6||c.h>top.h*1.4)return;
        if(!nx||c.y0<nx.y0)nx=c;
      });
      if(!nx)break;chain.push(nx);cur=nx;
    }
    function glyph(list){
      var gx0=Math.min.apply(null,list.map(function(g){return g.x0;})),gx1=Math.max.apply(null,list.map(function(g){return g.x1;}));
      var gy0=Math.min.apply(null,list.map(function(g){return g.y0;})),gy1=Math.max.apply(null,list.map(function(g){return g.y1;}));
      var gw=gx1-gx0+1,gh=gy1-gy0+1,gm=new Uint8Array(gw*gh);
      list.forEach(function(c){c.p.forEach(function(q){var x=q%RW,y=(q-x)/RW;gm[(y-gy0)*gw+(x-gx0)]=1;});});
      var r=classify(feature(gm,gw,gh),list.length);
      return r;
    }
    // Two marks side by side are a 10, or a rank with its suit printed beside it: try both and keep the better fit.
    grp.sort(function(a,b){return a.x0-b.x0;});
    var best=glyph(grp);
    if(grp.length===2){var one=glyph([grp[0]]);if(one.score<best.score)best=one;}
    if(chain.length>=3&&(best.rank==='J'||best.score>0.06))return {rank:'Joker',red:isRed,score:0};
    best.red=isRed;
    return best;
  }

  // Enclosed holes in a glyph: 8 has two; 0, 4, 6, 9, A, Q have one; the rest none.
  function holes(m,w,h){
    var W=w+2,H=h+2,bg=new Uint8Array(W*H),i,x,y;
    for(y=0;y<h;y++)for(x=0;x<w;x++)bg[(y+1)*W+x+1]=m[y*w+x]?0:1;
    for(x=0;x<W;x++){bg[x]=1;bg[(H-1)*W+x]=1;}for(y=0;y<H;y++){bg[y*W]=1;bg[y*W+W-1]=1;}
    var min=Math.max(3,w*h*0.008);
    return components(bg,W,H,1).filter(function(px){
      for(var k=0;k<px.length;k++){var q=px[k],qx=q%W,qy=(q-qx)/W;if(qx===0||qy===0||qx===W-1||qy===H-1)return false;}
      return px.length>=min;
    }).length;
  }
  // Shape of a glyph as a coarse grid of ink coverage, plus its width/height ratio and hole count.
  function feature(m,w,h){
    var f=new Float32Array(GX*GY);
    for(var gy=0;gy<GY;gy++)for(var gx=0;gx<GX;gx++){
      var xa=Math.floor(gx*w/GX),xb=Math.max(xa+1,Math.floor((gx+1)*w/GX)),ya=Math.floor(gy*h/GY),yb=Math.max(ya+1,Math.floor((gy+1)*h/GY)),s=0,c=0;
      for(var y=ya;y<yb&&y<h;y++)for(var x=xa;x<xb&&x<w;x++){s+=m[y*w+x];c++;}
      f[gy*GX+gx]=c?s/c:0;
    }
    return {f:f,asp:w/h,holes:holes(m,w,h)};
  }

  var TPL=null;
  function templates(){
    if(TPL)return TPL;
    TPL=[];
    var c=document.createElement('canvas');c.width=260;c.height=160;
    var g=c.getContext('2d',{willReadFrequently:true});
    FONTS.forEach(function(font){
      RANKS.forEach(function(r){
        g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
        g.fillStyle='#000';g.font=font;g.textBaseline='middle';
        // 10 is often printed tight on cards: try it normal and squeezed together
        var variants=r==='10'?[0,-12]:[null];
        variants.forEach(function(sp){
          g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#000';
          if(sp===null)g.fillText(r,20,80);
          else{g.fillText('1',20,80);g.fillText('0',20+g.measureText('1').width+sp,80);}
          var d=g.getImageData(0,0,c.width,c.height).data,x0=1e9,x1=-1,y0=1e9,y1=-1,x,y;
          for(y=0;y<c.height;y++)for(x=0;x<c.width;x++)if(d[(y*c.width+x)*4]<128){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
          var w=x1-x0+1,h=y1-y0+1,m=new Uint8Array(w*h);
          for(y=0;y<h;y++)for(x=0;x<w;x++)m[y*w+x]=d[((y+y0)*c.width+x+x0)*4]<128?1:0;
          var ft=feature(m,w,h);ft.rank=r;TPL.push(ft);
        });
      });
      // the 1 of a 10 on its own, when the 0 was not picked up
      g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#000';g.fillText('1',20,80);
      var d1=g.getImageData(0,0,c.width,c.height).data,a0=1e9,a1=-1,b0=1e9,b1=-1,xx,yy;
      for(yy=0;yy<c.height;yy++)for(xx=0;xx<c.width;xx++)if(d1[(yy*c.width+xx)*4]<128){if(xx<a0)a0=xx;if(xx>a1)a1=xx;if(yy<b0)b0=yy;if(yy>b1)b1=yy;}
      var w1=a1-a0+1,h1=b1-b0+1,m1=new Uint8Array(w1*h1);
      for(yy=0;yy<h1;yy++)for(xx=0;xx<w1;xx++)m1[yy*w1+xx]=d1[((yy+b0)*c.width+xx+a0)*4]<128?1:0;
      var f1=feature(m1,w1,h1);f1.rank='10';TPL.push(f1);
    });
    return TPL;
  }
  function classify(ft,parts){
    var best={},T=templates();
    T.forEach(function(t){
      var s=0;for(var i=0;i<t.f.length;i++){var e=ft.f[i]-t.f[i];s+=e*e;}
      s/=t.f.length;
      var la=Math.log(ft.asp/t.asp);s+=0.05*la*la;
      if(ft.holes!==t.holes)s+=0.03*Math.min(2,Math.abs(ft.holes-t.holes)); // blur can close a small hole, so a nudge, not a veto
      if(t.rank==='10'&&parts===2)s*=0.7;          // two marks side by side is a strong hint for 10
      if(t.rank!=='10'&&parts===2)s*=1.3;
      if(!(t.rank in best)||s<best[t.rank])best[t.rank]=s;
    });
    var order=Object.keys(best).sort(function(a,b){return best[a]-best[b];});
    return {rank:order[0],score:best[order[0]],margin:best[order[1]]-best[order[0]]};
  }

  /* ---------- all together ---------- */
  // Resolves to {cards:[{rank, red, sure}], preview: dataURL of the photo with each found card outlined and numbered}.
  function read(file){
    return load(file).then(function(L){
      var img=L.data,cards=findCards(img),out=[];
      cards.forEach(function(R){
        var res=readCard(warp(img,R));
        var sure=!!res&&(res.rank==='Joker'||(res.score<0.15&&res.margin>0.03));
        out.push({rank:res?res.rank:null,red:res?res.red:false,sure:sure,rect:R});
      });
      return {cards:out,preview:preview(L.canvas,out)};
    });
  }
  function preview(canvas,cards){
    var s=Math.min(1,640/Math.max(canvas.width,canvas.height));
    var c=document.createElement('canvas');c.width=Math.round(canvas.width*s);c.height=Math.round(canvas.height*s);
    var g=c.getContext('2d');g.drawImage(canvas,0,0,c.width,c.height);
    g.lineWidth=3;g.font='bold 22px sans-serif';g.textAlign='center';g.textBaseline='middle';
    cards.forEach(function(k,i){
      var R=k.rect,pts=(R.q||corners(R)).map(function(p){return [p[0]*s,p[1]*s];});
      g.strokeStyle=k.sure?'#d1a84e':'#e8806f';
      g.beginPath();pts.forEach(function(p,j){if(j)g.lineTo(p[0],p[1]);else g.moveTo(p[0],p[1]);});g.closePath();g.stroke();
      g.fillStyle=k.sure?'#d1a84e':'#e8806f';g.beginPath();g.arc(R.cx*s,R.cy*s,16,0,7);g.fill();
      g.fillStyle='#0e1714';g.fillText(String(i+1),R.cx*s,R.cy*s+1);
    });
    return c.toDataURL('image/jpeg',0.8);
  }

  global.KabooScan={read:read,_findCards:findCards,_warp:warp,_readCard:readCard};
})(window);
