// WebGL2 orthographic globe for the opening: a full disc that can blur, desaturate and grid itself (uD) for the digital hand-over; uses real day, night-light and cloud maps.
(function (G) {
  'use strict';
  const VS = '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `#version 300 es
precision highp float;
uniform vec2 uRes,uC;uniform float uR,uLat,uLon,uAlpha,uD,uT;
uniform sampler2D uDay,uNight,uCloud;
out vec4 o;
const float PI=3.14159265;
float h(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec2 px=gl_FragCoord.xy-uC;
  vec2 v=px/uR;float r=length(v);
  vec3 L=normalize(vec3(-.62,.32,.72));
  float aa=1.5/uR;
  // space: sparse dim stars and a thin atmospheric limb (the digital hand-over keeps the older, brighter halo)
  vec2 sg=floor(gl_FragCoord.xy/2.);float s=h(sg);
  float star=step(.9975,s)*(.25+.75*h(sg+7.));
  float rim=max(r-1.,0.);
  float lit=smoothstep(-.9,.6,dot(normalize(vec3(v,0.)+vec3(0.,0.,.001)),L));
  float out1=step(1.,r+aa);
  vec3 bgR=vec3(.004,.006,.012)+vec3(.75,.8,1.)*star*.7+vec3(.16,.38,1.)*(exp(-rim*55.)*.7+exp(-rim*11.)*.07)*lit*lit*out1;
  vec3 bgD=vec3(.016,.026,.05)+vec3(.8,.85,1.)*step(.9965,s)*(.35+.65*h(sg+7.))+vec3(.25,.5,1.)*(exp(-rim*16.)*.85+exp(-rim*4.5)*.18)*(.25+.75*lit)*out1;
  vec3 bg=mix(bgR,bgD,uD);
  vec3 col=bg;
  if(r<1.+aa){
    float z=sqrt(max(1.-r*r,0.));
    float sl=sin(uLat),cl=cos(uLat);
    float lat=asin(clamp(z*sl+v.y*cl,-1.,1.));
    float lon=uLon+atan(v.x,z*cl-v.y*sl);
    vec2 uv=vec2(lon/(2.*PI)+.5,.5-lat/PI);
    vec2 a=vec2(fract(uv.x),uv.y),b=vec2(fract(uv.x+.5)-.5,uv.y);
    vec2 ga=fwidth(a),gb=fwidth(b);
    vec2 g=ga.x<gb.x?ga:gb;
    vec2 u2=vec2(fract(uv.x),uv.y);
    vec2 gx=vec2(g.x,0.)*(1.+uD*30.),gy=vec2(0.,g.y)*(1.+uD*30.);
    vec3 day=textureGrad(uDay,u2,gx,gy).rgb;
    vec3 nit=textureGrad(uNight,u2,gx,gy).rgb;
    vec3 n=vec3(v,z);
    float d=dot(n,L);
    float ocean=smoothstep(.0,.12,day.b-max(day.r,day.g)*.9);
    // realistic pass: photographic clouds with ground shadows, soft Lambert terminator, thin Rayleigh limb, filmic roll-off
    vec2 cu=u2+vec2(uT*.0012,0.);
    float cv=smoothstep(.1,.85,textureGrad(uCloud,cu,gx,gy).r)*(1.-uD);
    float cs=smoothstep(.1,.85,textureGrad(uCloud,cu+vec2(.0016,-.0012),gx,gy).r)*(1.-uD);
    float lam=max(d,0.);
    float dlR=smoothstep(-.06,.22,d)*(.25+.75*lam);
    vec3 dc=pow(day,vec3(1.18))*vec3(.94,1.,1.06);
    vec3 spec=vec3(1.,.9,.75)*pow(max(dot(reflect(-L,n),vec3(0.,0.,1.)),0.),48.)*ocean*.32;
    vec3 sunR=(dc*(.012+1.08*dlR)*(1.-.45*cs)+spec*dlR)*(1.-cv);
    sunR+=vec3(.93,.95,.98)*(.01+1.02*dlR)*cv;
    float edge=pow(1.-z,2.);
    sunR=mix(sunR,vec3(.22,.45,.95)*dlR,edge*.42);
    float nd=1.-smoothstep(-.18,.06,d);
    float cl2=max(dot(nit,vec3(.4,.4,.2))-.035,0.);
    vec3 nightR=vec3(1.,.72,.42)*cl2*2.4*nd*(1.-.75*cv)+vec3(.002,.003,.007);
    vec3 eR=sunR+nightR;
    eR+=vec3(1.,.5,.22)*exp(-pow((d+.02)*12.,2.))*.035;
    eR=1.-exp(-eR*1.3);
    // digital pass (unchanged look the hand-over was tuned against)
    float dl=smoothstep(-.08,.55,d);
    vec3 sunD=day*(.16+1.55*dl);
    vec3 nightD=nit*vec3(1.5,1.25,.9)*(1.-dl)*1.1+vec3(.004,.008,.02);
    vec3 eD=sunD*(1.-.55*pow(1.-z,2.6))+nightD+vec3(.28,.55,1.)*pow(1.-z,3.)*(.15+.85*lit)*1.35;
    eD+=vec3(1.,.55,.25)*exp(-pow((d-.02)*7.,2.))*.12;
    vec3 e=mix(eR,eD,smoothstep(0.,.6,uD));
    float luma=dot(e,vec3(.3,.59,.11));
    e=mix(e,vec3(luma)*vec3(.5,.72,1.15),uD*.88)*(1.-.5*uD);
    vec2 gf=abs(fract(vec2(uv.x*24.,uv.y*12.)+.5)-.5)/(g*vec2(24.,12.)+1e-5);
    float gl=1.-min(min(gf.x,gf.y),1.);
    e+=vec3(.3,.55,1.)*gl*uD*.3;
    col=mix(bg,e,1.-smoothstep(1.-aa,1.+aa,r));
  }
  o=vec4(col*uAlpha,1.);
}`;

  function shader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function image(src) {
    return new Promise((ok, no) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => ok(im);
      im.onerror = () => no(new Error('texture'));
      im.src = src;
    });
  }

  function create(canvas) {
    const gl = canvas.getContext('webgl2', {antialias: false, alpha: false, powerPreference: 'high-performance'});
    if (!gl) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(prog, n);
    const u = {res: U('uRes'), c: U('uC'), r: U('uR'), lat: U('uLat'), lon: U('uLon'), alpha: U('uAlpha'), d: U('uD'), t: U('uT')};
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    const wide = gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 8192 && !matchMedia('(pointer:coarse)').matches;

    function upload(unit, im) {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, im);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    }

    return {
      load() {
        return Promise.all([
          image(wide ? 'assets/earth-day-8192.webp' : 'assets/earth-day-4096.webp'),
          image('assets/earth-night-4096.webp'),
          image(wide ? 'assets/earth-clouds-4096.webp' : 'assets/earth-clouds-2048.webp')
        ]).then(([d, n, c]) => {
          upload(0, d); upload(1, n); upload(2, c);
          gl.uniform1i(U('uDay'), 0); gl.uniform1i(U('uNight'), 1); gl.uniform1i(U('uCloud'), 2);
        });
      },
      resize(w, h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(u.res, w, h);
      },
      draw(cx, cy, r, lat, lon, alpha, digital, time) {
        gl.uniform2f(u.c, cx, cy); gl.uniform1f(u.r, r);
        gl.uniform1f(u.lat, lat); gl.uniform1f(u.lon, lon); gl.uniform1f(u.alpha, alpha); gl.uniform1f(u.d, digital || 0); gl.uniform1f(u.t, (time || 0) / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose() {
        const x = gl.getExtension('WEBGL_lose_context');
        if (x) x.loseContext();
      }
    };
  }

  G.ZTGlobe = {create};
})(window);
